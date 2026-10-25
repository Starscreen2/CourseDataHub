import os
import logging

from flask import Flask, jsonify, request, render_template
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from course_fetcher import CourseFetcher
from room_fetcher import RoomFetcher
from salary_api import SalaryData
from utils.flask_utils import get_request_params

# Configure logging
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.environ.get("SESSION_SECRET") or os.urandom(32)

# Same-origin requests (the bundled frontend) do not need CORS. If the API is
# intentionally consumed by another origin, opt in with CORS_ORIGIN.
@app.after_request
def after_request(response):
    cors_origin = os.environ.get("CORS_ORIGIN")
    if cors_origin:
        response.headers["Access-Control-Allow-Origin"] = cors_origin
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET"
    return response

# Configure rate limiting
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["10 per minute"],
    storage_uri=os.environ.get("RATELIMIT_STORAGE_URI", "memory://"),
)

# Course data is fetched lazily on the first request for a given term. This is
# important for Vercel: imports must stay fast and background threads are not
# guaranteed to survive between invocations.
course_fetcher = CourseFetcher()
room_fetcher = RoomFetcher(course_fetcher)
salary_data = SalaryData()

@app.route('/')
def select_parameters():
    return render_template('select.html')

@app.route('/search')
def search():
    params = get_request_params()
    return render_template('search.html', year=params['year'], term=params['term'], campus=params['campus'])

@app.route('/docs')
def docs():
    return render_template('docs.html')

@app.route('/api/health')
@limiter.exempt
def health_check():
    return jsonify({
        "status": "healthy",
        "last_update": course_fetcher.last_update,
        "cached_terms": len(course_fetcher.courses_by_params),
    })

@app.route('/api/courses')
@limiter.limit("100 per minute")
def get_courses():
    try:
        params = get_request_params()
        search = request.args.get('search', '').strip()[:100]
        
        # Extract filter parameters
        filter_params = {}
        
        # Section status filters
        status_filters = []
        if request.args.get('status_open', '').lower() == 'true':
            status_filters.append('open')
        if request.args.get('status_closed', '').lower() == 'true':
            status_filters.append('closed')
        if status_filters:
            filter_params['status'] = status_filters
        
        # Course type filters
        course_types = []
        if request.args.get('type_traditional', '').lower() == 'true':
            course_types.append('traditional')
        if request.args.get('type_hybrid', '').lower() == 'true':
            course_types.append('hybrid')
        if request.args.get('type_online', '').lower() == 'true':
            course_types.append('online')
        if course_types:
            filter_params['course_type'] = course_types
        
        # Day filters
        days = []
        if request.args.get('day_m', '').lower() == 'true':
            days.append('M')
        if request.args.get('day_t', '').lower() == 'true':
            days.append('T')
        if request.args.get('day_w', '').lower() == 'true':
            days.append('W')
        if request.args.get('day_h', '').lower() == 'true':
            days.append('H')
        if request.args.get('day_f', '').lower() == 'true':
            days.append('F')
        if request.args.get('day_weekend', '').lower() == 'true':
            days.append('weekend')
        if days:
            filter_params['days'] = days
        
        # Time range filters
        time_ranges = []
        if request.args.get('time_morning', '').lower() == 'true':
            time_ranges.append('morning')
        if request.args.get('time_afternoon', '').lower() == 'true':
            time_ranges.append('afternoon')
        if request.args.get('time_evening', '').lower() == 'true':
            time_ranges.append('evening')
        if time_ranges:
            filter_params['time_range'] = time_ranges
        
        # Campus filters
        campus_filters = []
        if request.args.get('campus_college_ave', '').lower() == 'true':
            campus_filters.append('College Ave')
        if request.args.get('campus_busch', '').lower() == 'true':
            campus_filters.append('Busch')
        if request.args.get('campus_livingston', '').lower() == 'true':
            campus_filters.append('Livingston')
        if request.args.get('campus_cook_doug', '').lower() == 'true':
            campus_filters.append('Cook/Doug')
        if request.args.get('campus_online', '').lower() == 'true':
            campus_filters.append('Online')
        if campus_filters:
            filter_params['campus'] = campus_filters
        
        # School/Unit filter
        school = request.args.get('school', '')
        if school:
            filter_params['school'] = school
        
        # Core code filter
        core_code = request.args.get('core_code', '')
        if core_code:
            filter_params['core_code'] = core_code
        
        # Subject filter
        subject = request.args.get('subject', '')
        if subject:
            filter_params['subject'] = subject

        course_number = request.args.get('course_number', '').strip()
        if course_number:
            filter_params['course_number'] = course_number

        courses = course_fetcher.get_courses(
            search=search, 
            year=params['year'], 
            term=params['term'], 
            campus=params['campus'],
            filters=filter_params if filter_params else None
        )
        return jsonify({
            "status": "success",
            "data": courses,
            "last_update": course_fetcher.last_update
        })
    except Exception as e:
        logger.error(f"Error fetching courses: {str(e)}")
        return jsonify({
            "status": "error",
            "message": "Failed to fetch course data"
        }), 500

@app.errorhandler(429)
def ratelimit_handler(e):
    retry_after = getattr(e, "retry_after", None)
    response = jsonify({
        "status": "error",
        "message": "Too many requests. Please slow down and try again shortly.",
        "retry_after": retry_after,
        "wait_message": (
            f"Please wait {retry_after} seconds before trying again."
            if retry_after is not None else "Please try again later."
        ),
    })
    if retry_after is not None:
        response.headers["Retry-After"] = str(retry_after)
    return response, 429

@app.route('/api/salary', methods=['GET'])
@limiter.limit("50 per minute")
def get_salary():
    instructor_name = request.args.get('name', '').strip()[:120]

    if not instructor_name:
        logger.info("Salary lookup received no instructor name")
        return jsonify({"error": "Missing instructor name"}), 400

    logger.info("Salary lookup for %r", instructor_name)

    salary_info = salary_data.get_salary_by_instructor(instructor_name)

    if salary_info:
        salary_entry = salary_info[0]  # Get first match
        return jsonify({
            "name": salary_entry.get("Name", "Unknown"),
            "title": salary_entry.get("Title", "Unknown"),
            "department": salary_entry.get("Department", "Unknown"),
            "campus": salary_entry.get("Campus", "Unknown"),
            "base_pay": salary_entry.get("Base Pay", "Unknown"),
            "gross_pay": salary_entry.get("Gross Pay", "Unknown"),
            "hire_date": salary_entry.get("Hire Date", "Unknown")
        })

    logger.info("No salary data found for %r", instructor_name)
    return jsonify({"error": "No salary data found"}), 404

@app.route('/room-search')
def room_search_page():
    """Render the room search page"""
    params = get_request_params()
    return render_template('room_search.html', year=params['year'], term=params['term'], campus=params['campus'])

@app.route('/room-details')
def room_details_page():
    """Render the room details page with schedule"""
    params = get_request_params()
    building = request.args.get('building', '')
    room = request.args.get('room', '')
    
    if not building or not room:
        return render_template('room_search.html', year=params['year'], term=params['term'], campus=params['campus'], 
                              error="Building and room must be specified")
    
    return render_template('room_details.html', year=params['year'], term=params['term'], campus=params['campus'],
                          building=building, room=room)

@app.route('/api/rooms')
@limiter.limit("50 per minute")
def get_rooms():
    """API endpoint to get rooms matching a query, with optional availability filtering"""
    try:
        params = get_request_params()
        search = request.args.get('search', '').strip()[:100]
        
        # Get availability filter parameters
        filter_available = request.args.get('filter_available', '').lower() == 'true'
        day = request.args.get('day', '')
        start_time = request.args.get('start_time', '')
        end_time = request.args.get('end_time', '')
        
        # Get building type filters
        building_types = []
        if request.args.get('type_classroom', '').lower() == 'true':
            building_types.append('classroom')
        if request.args.get('type_lecture', '').lower() == 'true':
            building_types.append('lecture')
        if request.args.get('type_lab', '').lower() == 'true':
            building_types.append('lab')
        building_type_filter_active = (
            request.args.get('filter_building_types', '').lower() == 'true'
            or bool(building_types)
        )
        
        # Get campus filters
        campus_filters = []
        if request.args.get('campus_college_ave', '').lower() == 'true':
            campus_filters.append('College Ave')
        if request.args.get('campus_busch', '').lower() == 'true':
            campus_filters.append('Busch')
        if request.args.get('campus_livingston', '').lower() == 'true':
            campus_filters.append('Livingston')
        if request.args.get('campus_cook_doug', '').lower() == 'true':
            campus_filters.append('Cook/Doug')
        campus_filter_active = (
            request.args.get('filter_campuses', '').lower() == 'true'
            or bool(campus_filters)
        )

        if filter_available and not (day and start_time and end_time):
            return jsonify({
                "status": "error",
                "message": "Day, start time, and end time are required for availability filtering.",
            }), 400
        if filter_available:
            valid_days = {
                "monday": "Monday", "tuesday": "Tuesday", "wednesday": "Wednesday",
                "thursday": "Thursday", "friday": "Friday", "saturday": "Saturday", "sunday": "Sunday",
            }
            day = valid_days.get(day.strip().lower())
            start_minutes = room_fetcher._time_to_minutes(start_time)
            end_minutes = room_fetcher._time_to_minutes(end_time)
            if day is None or start_minutes >= 24 * 60 or end_minutes >= 24 * 60 or start_minutes >= end_minutes:
                return jsonify({
                    "status": "error",
                    "message": "Choose a valid day and an increasing start/end time range.",
                }), 400

        if (building_type_filter_active and not building_types) or (campus_filter_active and not campus_filters):
            rooms = []
        elif filter_available:
            # Filter rooms by availability while preserving the building and campus selections.
            logger.debug(f"Filtering for available rooms on {day} from {start_time} to {end_time}")
            rooms = room_fetcher.find_available_rooms(
                day=day,
                start_time=start_time,
                end_time=end_time,
                year=params['year'],
                term=params['term'],
                campus=params['campus'],
                search=search,
                building_types=building_types if building_type_filter_active else None,
                campus_filters=campus_filters if campus_filter_active else None,
            )
        else:
            # Regular room search with the same selected filters.
            rooms = room_fetcher.search_rooms(
                search,
                year=params['year'],
                term=params['term'],
                campus=params['campus'],
                building_types=building_types if building_type_filter_active else None,
                campus_filters=campus_filters if campus_filter_active else None,
            )
        
        return jsonify({
            "status": "success",
            "data": rooms,
            "count": len(rooms),
            "filter_applied": bool(filter_available),
            "building_types_filtered": building_type_filter_active,
            "campus_filtered": campus_filter_active,
            "last_update": course_fetcher.last_update
        })
    except Exception as e:
        logger.error(f"Error searching rooms: {str(e)}")
        return jsonify({
            "status": "error",
            "message": "Failed to search rooms"
        }), 500

@app.route('/api/room-schedule')
@limiter.limit("30 per minute")
def get_room_schedule():
    """API endpoint to get the schedule for a specific room"""
    try:
        params = get_request_params()
        building = request.args.get('building', '')
        room = request.args.get('room', '')
        
        if not building or not room:
            return jsonify({
                "status": "error",
                "message": "Building and room must be specified"
            }), 400
        
        room_schedule = room_fetcher.get_room_schedule(
            building, room, year=params['year'], term=params['term'], campus=params['campus']
        )
        
        return jsonify({
            "status": "success",
            "data": room_schedule,
            "last_update": course_fetcher.last_update
        })
    except Exception as e:
        logger.error(f"Error getting room schedule: {str(e)}")
        return jsonify({
            "status": "error",
            "message": "Failed to get room schedule"
        }), 500
