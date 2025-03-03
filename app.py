import os
from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_caching import Cache
from apscheduler.schedulers.background import BackgroundScheduler
from course_fetcher import CourseFetcher
from salary_api import SalaryData  # Import SalaryData class for salaries
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key")

# Configure CORS
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'GET')
    return response

# Configure rate limiting
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["10 per minute"],
    storage_uri="memory://"
)

# Configure caching
cache = Cache(app, config={'CACHE_TYPE': 'SimpleCache'})

# Initialize course fetcher
course_fetcher = CourseFetcher()

# Initialize scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(func=lambda: course_fetcher.update_courses("2025", "1", "NB"), trigger="interval", minutes=15)
scheduler.start()

# Initialize SalaryData for salaries
salary_data = SalaryData()

@app.route('/')
def select_parameters():
    return render_template('select.html')

@app.route('/search')
def search():
    year = request.args.get('year', '2025')
    term = request.args.get('term', '1')
    campus = request.args.get('campus', 'NB')
    return render_template('search.html', year=year, term=term, campus=campus)

@app.route('/api/health')
@limiter.exempt
def health_check():
    return jsonify({
        "status": "healthy",
        "last_update": course_fetcher.last_update
    })

@app.route('/api/courses')
@limiter.limit("100 per minute")
def get_courses():
    try:
        year = request.args.get('year', '2025')
        term = request.args.get('term', '1')
        campus = request.args.get('campus', 'NB')
        search = request.args.get('search', '')

        courses = course_fetcher.get_courses(search=search, year=year, term=term, campus=campus)
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

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.errorhandler(429)
def ratelimit_handler(e):
    retry_seconds = int(e.description.split('in')[1].split('seconds')[0].strip())
    return jsonify({
        "status": "error",
        "message": "Please slow down! You can only make 10 requests per minute.",
        "retry_after": retry_seconds,
        "wait_message": f"Please wait {retry_seconds} seconds before trying again."
    }), 429

@app.route('/api/salary', methods=['GET'])
@limiter.limit("50 per minute")
def get_salary():
    instructor_name = request.args.get('name', '').strip()

    if not instructor_name:
        print("❌ No instructor name received!")
        return jsonify({"error": "Missing instructor name"}), 400

    print(f"🔍 Salary API received request for: '{instructor_name}'")  # Debugging

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

    print("⚠️ No salary data found!")
    return jsonify({"error": "No salary data found"}), 404



if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
