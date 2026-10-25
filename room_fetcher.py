import logging
import datetime
import re
from typing import Dict, List, Optional
from course_fetcher import CourseFetcher
from rapidfuzz import fuzz
from utils.constants import CAMPUS_ID_TO_NAME, CAMPUS_ABBREV_TO_NAME
from utils.fuzzy_utils import get_best_fuzzy_score

# Rutgers building coordinates (you can expand this dictionary)
BUILDING_COORDINATES = {
    'ARC': {'lat': 40.5008, 'lng': -74.4474},  # Academic Resource Center
    'HILL': {'lat': 40.5009, 'lng': -74.4475},  # Hill Center
    'BECK': {'lat': 40.5010, 'lng': -74.4476},  # Beck Hall
    # Add more buildings as needed
}

class RoomFetcher:
    """
    A class to search, filter, and retrieve room information and availability
    based on course data provided by the CourseFetcher class.
    """

    def __init__(self, course_fetcher: CourseFetcher):
        """Initialize the RoomFetcher with a course fetcher instance"""
        self.course_fetcher = course_fetcher
        self.logger = logging.getLogger(__name__)

    def _get_room_coordinates(self, building: str) -> Optional[Dict[str, float]]:
        """
        Get the coordinates for a building.
        Returns None if coordinates are not available.
        """
        return BUILDING_COORDINATES.get(building.upper())

    @staticmethod
    def _normalize_search(value: str) -> str:
        return re.sub(r"\s+", " ", str(value or "").strip()).casefold()

    def _extract_rooms_from_courses(self, courses: List[Dict]) -> List[Dict]:
        """
        Extract and deduplicate room information from course data.
        Returns a list of unique rooms with their details.
        """
        rooms = {}
        
        for course in courses:
            for section in course.get('sections', []):
                for meeting_time in section.get('meeting_times', []):
                    building = str(meeting_time.get('building') or '').strip()
                    room = str(meeting_time.get('room') or '').strip()
                    
                    placeholders = {'n/a', 'na', 'none', 'null'}
                    if (
                        not building
                        or not room
                        or building.casefold() in placeholders
                        or room.casefold() in placeholders
                    ):
                        continue
                        
                    room_key = f"{building}_{room}"
                    
                    if room_key not in rooms:
                        # The schedule feed does not classify room/building types.
                        coordinates = self._get_room_coordinates(building)
                        
                        rooms[room_key] = {
                            'building': building,
                            'room': room,
                            'full_name': f"{building} {room}",
                            'building_name': meeting_time.get('building_name', ''),
                            # CourseFetcher exposes the normalized campus as
                            # `campus`; keep both names for compatibility with
                            # older frontend payloads.
                            'campus': meeting_time.get('campus', ''),
                            'campus_name': meeting_time.get('campus_name') or meeting_time.get('campus', ''),
                            'latitude': coordinates['lat'] if coordinates else None,
                            'longitude': coordinates['lng'] if coordinates else None,
                            'building_type': 'unknown'
                        }
        
        return list(rooms.values())

    def get_all_rooms(self, year="2026", term="1", campus="NB", courses: Optional[List[Dict]] = None) -> List[Dict]:
        """
        Retrieve a list of all unique rooms from the course data.
        """
        if courses is None:
            courses = self.course_fetcher.get_courses(year=year, term=term, campus=campus)
        return self._extract_rooms_from_courses(courses)

    def search_rooms(self, query: str, year="2026", term="1", campus="NB",
                    campus_filters: List[str] = None,
                    courses: Optional[List[Dict]] = None) -> List[Dict]:
        """
        Search for rooms matching the given query using fuzzy matching and semantic search.
        Enhanced to better handle full room names, building names, and course-related searches.
        Includes search by school, campus location, prerequisites, and core codes.
        """
        if courses is None:
            courses = self.course_fetcher.get_courses(year=year, term=term, campus=campus)
        room_catalog = self.get_all_rooms(year, term, campus, courses=courses)
        all_rooms = room_catalog.copy()

        # A known building plus a room number is a precise lookup. Keep it out
        # of the fuzzy path so nearby room numbers cannot appear as matches.
        query_parts = self._normalize_search(query).split()
        if len(query_parts) >= 2 and any(character.isdigit() for character in query_parts[-1]):
            requested_room = query_parts[-1]
            requested_building = " ".join(query_parts[:-1])

            def matches_building(room: Dict) -> bool:
                return requested_building in {
                    self._normalize_search(room.get('building', '')),
                    self._normalize_search(room.get('building_name', '')),
                }

            if any(matches_building(room) for room in room_catalog):
                # Campus filters still apply; an exact room on another campus
                # must not leak into the result.
                if campus_filters:
                    normalized_campuses = {str(value).strip().casefold() for value in campus_filters}
                    all_rooms = [
                        room for room in all_rooms
                        if str(room.get('campus_name') or room.get('campus') or '').strip().casefold()
                        in normalized_campuses
                    ]
                return [
                    room for room in all_rooms
                    if self._normalize_search(room.get('room', '')) == requested_room
                    and matches_building(room)
                ]
        
        # Apply campus filters
        if campus_filters:
            normalized_campuses = {str(value).strip().lower() for value in campus_filters}
            all_rooms = [
                room for room in all_rooms
                if str(room.get('campus_name') or room.get('campus') or '').strip().lower()
                in normalized_campuses
            ]
        
        if not query:
            return all_rooms
        
        # Create a mapping of rooms to their associated courses with enhanced information
        room_courses = {}
        for course in courses:
            for section in course.get('sections', []):
                for meeting_time in section.get('meeting_times', []):
                    building = meeting_time.get('building')
                    room = meeting_time.get('room')
                    if building and room:
                        room_key = f"{building}_{room}"
                        if room_key not in room_courses:
                            room_courses[room_key] = []
                        room_courses[room_key].append({
                            'title': course.get('title', ''),
                            'description': course.get('description', ''),
                            'courseString': course.get('courseString', ''),
                            'school': course.get('school', ''),
                            'prerequisites': course.get('prerequisites', ''),
                            'coreCodes': course.get('coreRequirements', course.get('coreCodes', [])),
                            'campus': meeting_time.get('campus', ''),
                            'campus_name': meeting_time.get('campus_name', '')
                        })
        
        # Prepare search fields and weights
        search_fields = [
            ('full_name', 100),      # Highest weight for full room name
            ('building_name', 95),   # High weight for full building name
            ('building', 90),        # High weight for building code
            ('room', 80),            # Medium weight for room number
        ]
        
        # Check for direct matches first (case-insensitive exact or partial matches)
        query_lower = query.lower()
        direct_matches = []
        
        for room in all_rooms:
            # Create additional searchable formats for the room
            building_room = f"{room.get('building', '')} {room.get('room', '')}".lower()
            building_name_room = f"{room.get('building_name', '')} {room.get('room', '')}".lower()
            
            # Check for direct building and room matches
            if (query_lower == building_room or 
                query_lower in building_room or 
                query_lower == building_name_room or 
                query_lower in building_name_room or
                query_lower == room.get('full_name', '').lower()):
                direct_matches.append(room)
        
        # If we found direct matches, return them first
        if direct_matches:
            return direct_matches
            
        # Otherwise, proceed with fuzzy matching and semantic search
        scored_rooms = []
        
        for room in all_rooms:
            max_score = 0
            
            # Basic fuzzy matching on room fields
            for field, weight in search_fields:
                if field in room:
                    # Normalize to string for fuzzy matching
                    field_value = str(room[field]).lower()
                    
                    # Use utility function to get best fuzzy score
                    field_score = get_best_fuzzy_score(query_lower, field_value)
                    
                    # Apply field weight and keep the highest overall score
                    weighted_score = (field_score * weight) / 100
                    max_score = max(max_score, weighted_score)
            
            # Semantic search through associated courses
            room_key = f"{room.get('building', '')}_{room.get('room', '')}"
            if room_key in room_courses:
                for course_info in room_courses[room_key]:
                    # Search in course title and description
                    title_score = fuzz.token_set_ratio(query_lower, course_info['title'].lower())
                    desc_score = fuzz.token_set_ratio(query_lower, course_info['description'].lower())
                    
                    # Search in school
                    school_score = fuzz.token_set_ratio(query_lower, course_info['school'].lower())
                    
                    # Search in prerequisites
                    prereq_score = fuzz.token_set_ratio(query_lower, course_info['prerequisites'].lower())
                    
                    # Search in core codes
                    core_codes_score = 0
                    if course_info['coreCodes']:
                        core_codes_text = ' '.join(
                            item.get('code', '') if isinstance(item, dict) else str(item)
                            for item in course_info['coreCodes']
                        ).lower()
                        core_codes_score = fuzz.token_set_ratio(query_lower, core_codes_text)
                    
                    # Search in campus location
                    campus_score = fuzz.token_set_ratio(query_lower, course_info['campus_name'].lower())
                    
                    # Add course-related information to the room
                    if any(score > 50 for score in [title_score, desc_score, school_score, prereq_score, core_codes_score, campus_score]):
                        if 'courses' not in room:
                            room['courses'] = []
                        room['courses'].append({
                            'title': course_info['title'],
                            'code': course_info['courseString'],
                            'school': course_info['school'],
                            'prerequisites': course_info['prerequisites'],
                            'coreCodes': course_info['coreCodes'],
                            'campus': course_info['campus_name']
                        })
                    
                    # Add semantic scores to overall score
                    semantic_scores = [
                        title_score * 0.8,      # Weight title matches
                        desc_score * 0.7,       # Weight description matches
                        school_score * 0.9,     # Weight school matches highly
                        prereq_score * 0.6,     # Weight prerequisite matches
                        core_codes_score * 0.8, # Weight core code matches
                        campus_score * 0.9      # Weight campus matches highly
                    ]
                    semantic_score = max(semantic_scores)
                    max_score = max(max_score, semantic_score)
            
            # Only include rooms that meet the threshold
            if max_score >= 40:  # Lower threshold to catch more potential matches
                scored_rooms.append((room, max_score))
        
        # Sort by score descending
        sorted_rooms = [room for room, score in sorted(scored_rooms, key=lambda x: x[1], reverse=True)]
        
        return sorted_rooms

    def _is_time_in_range(self, target_start: str, target_end: str, class_start: str, class_end: str) -> bool:
        """Return whether the target interval overlaps a class interval.

        Unknown class times are treated as occupied so availability checks do
        not claim a room is free when the schedule data is incomplete.
        """
        target_start_minutes = self._time_to_minutes(target_start)
        target_end_minutes = self._time_to_minutes(target_end)
        class_start_minutes = self._time_to_minutes(class_start)
        class_end_minutes = self._time_to_minutes(class_end)

        if target_start_minutes >= 24 * 60 or target_end_minutes >= 24 * 60:
            return False
        if target_start_minutes >= target_end_minutes:
            return False
        if class_start_minutes >= 24 * 60 or class_end_minutes >= 24 * 60:
            return True
        if class_start_minutes >= class_end_minutes:
            return True

        return target_start_minutes < class_end_minutes and class_start_minutes < target_end_minutes

    @staticmethod
    def _time_to_minutes(value: str) -> int:
        """Return minutes since midnight, or a sentinel for missing/invalid time."""
        text = str(value or '').strip()
        if not text or text.upper() in {'TBA', 'N/A', 'NA', 'NONE', 'NULL'}:
            return 24 * 60 + 1
        try:
            parsed = datetime.datetime.strptime(text, '%I:%M %p')
            return parsed.hour * 60 + parsed.minute
        except (TypeError, ValueError):
            return 24 * 60 + 1
    
    def _filter_by_campus(self, rooms: List[Dict], campus_filter: str) -> List[Dict]:
        """
        Filter rooms by specific campus.
        
        Parameters:
        - rooms: List of room dictionaries to filter
        - campus_filter: Campus string to filter by (e.g., "College Ave", "Busch", etc.)
        
        Returns a filtered list of rooms on the specified campus.
        """
        if not campus_filter:
            return rooms
            
        # Get the campus name if a code was provided, using shared constants
        campus_name = CAMPUS_ID_TO_NAME.get(campus_filter, campus_filter)
        
        # Log a sample room to see its structure
        if rooms and len(rooms) > 0:
            sample_room = rooms[0]
            self.logger.debug(f"Sample room structure: {sample_room}")
            self.logger.debug(f"Campus filter: {campus_filter}, Campus name: {campus_name}")
        
        # Filter rooms by campus
        filtered_rooms = []
        
        for room in rooms:
            # Get campus info from the room, directly from our enhanced room structure
            room_campus_code = room.get('campus')
            room_campus_name = room.get('campus_name')
            
            # Determine if this room matches the filter
            is_match = False
            
            # If we have a campus name from the room that matches directly
            if room_campus_name and (
                room_campus_name == campus_name or
                room_campus_name.lower() == campus_name.lower()):
                is_match = True
            
            # If we have a campus code from the room, check all possible mappings
            elif room_campus_code:
                # Check if code maps directly using shared constants
                mapped_name = CAMPUS_ID_TO_NAME.get(room_campus_code)
                if mapped_name and mapped_name == campus_name:
                    is_match = True
                    
                # Check abbreviation mappings using shared constants
                elif not mapped_name:
                    mapped_name = CAMPUS_ABBREV_TO_NAME.get(room_campus_code)
                    if mapped_name and mapped_name == campus_name:
                        is_match = True
            
            # If there's a match, add to filtered list
            if is_match:
                self.logger.debug(f"Match: Room {room.get('building', '')} {room.get('room', '')}")
                filtered_rooms.append(room)
        
        self.logger.debug(f"Campus filter '{campus_name}' found {len(filtered_rooms)} of {len(rooms)} rooms")
        return filtered_rooms

    def find_available_rooms(self, day: str, start_time: str, end_time: str, year="2026",
                            term="1", campus="NB", campus_filter="", search: str = "",
                            campus_filters: Optional[List[str]] = None) -> List[Dict]:
        """Find rooms with no known or unresolved meeting during the requested interval."""
        days_of_week = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        days_by_key = {weekday.casefold(): weekday for weekday in days_of_week}
        requested_day = days_by_key.get(str(day or "").strip().casefold())
        if not requested_day:
            return []

        courses = self.course_fetcher.get_courses(year=year, term=term, campus=campus)
        all_rooms = self.search_rooms(
            search,
            year,
            term,
            campus,
            campus_filters=campus_filters,
            courses=courses,
        )

        if campus_filter and not campus_filters:
            normalized_campus = str(campus_filter).strip().casefold()
            all_rooms = [
                room for room in all_rooms
                if str(room.get('campus_name') or room.get('campus') or '').strip().casefold()
                == normalized_campus
            ]

        available_rooms = []
        for room_info in all_rooms:
            building = room_info['building']
            room = room_info['room']
            is_available = True

            for course in courses:
                for section in course.get('sections', []):
                    for meeting_time in section.get('meeting_times', []):
                        if meeting_time.get('building') != building or meeting_time.get('room') != room:
                            continue

                        meeting_day = str(meeting_time.get('day') or '').strip()
                        normalized_meeting_day = days_by_key.get(meeting_day.casefold())
                        if not normalized_meeting_day:
                            # A room-assigned meeting with no usable day could
                            # occupy any day, so do not report this room free.
                            is_available = False
                            break
                        if normalized_meeting_day != requested_day:
                            continue

                        class_start = (meeting_time.get('start_time') or {}).get('formatted', 'TBA')
                        class_end = (meeting_time.get('end_time') or {}).get('formatted', 'TBA')
                        if self._is_time_in_range(start_time, end_time, class_start, class_end):
                            is_available = False
                            break
                    if not is_available:
                        break
                if not is_available:
                    break

            if is_available:
                room_with_availability = room_info.copy()
                room_with_availability['is_available'] = True
                room_with_availability['checked_day'] = requested_day
                room_with_availability['checked_start_time'] = start_time
                room_with_availability['checked_end_time'] = end_time
                available_rooms.append(room_with_availability)

        return available_rooms

    def get_room_schedule(self, building: str, room: str, year="2026", term="1", campus="NB") -> Optional[Dict]:
        """Get a room's weekly schedule and surface incomplete meeting data."""
        courses = self.course_fetcher.get_courses(year=year, term=term, campus=campus)
        days_of_week = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        schedule = {
            "room_info": {
                "building": building,
                "room": room,
                "full_name": f"{building} {room}",
            },
            "daily_schedule": {day: [] for day in days_of_week},
            "weekly_schedule": [],
            "unscheduled_classes": [],
            "has_incomplete_schedule": False,
        }
        room_found = False
        incomplete_days = set()
        has_unknown_day = False

        for course in courses:
            for section in course.get('sections', []):
                for meeting_time in section.get('meeting_times', []):
                    if meeting_time.get('building') != building or meeting_time.get('room') != room:
                        continue
                    room_found = True

                    instructors = []
                    instructor_list = section.get('instructors')
                    if isinstance(instructor_list, list):
                        for instructor in instructor_list:
                            if isinstance(instructor, dict) and instructor.get('name'):
                                instructors.append({"name": instructor['name']})
                            elif isinstance(instructor, str) and instructor.strip():
                                instructors.append({"name": instructor.strip()})

                    instructor_text = str(section.get('instructorsText') or '').strip()
                    if not instructors and instructor_text:
                        instructors = [
                            {"name": name.strip()}
                            for name in instructor_text.split(',')
                            if name.strip()
                        ]
                    if not instructors:
                        instructors = [{"name": "TBA"}]

                    start_time = (meeting_time.get('start_time') or {}).get('formatted') or 'TBA'
                    end_time = (meeting_time.get('end_time') or {}).get('formatted') or 'TBA'
                    class_entry = {
                        "course_name": course.get('title', 'Unknown'),
                        "course_code": course.get('courseString', 'Unknown'),
                        "section": section.get('number', 'Unknown'),
                        "instructors": instructors,
                        "instructor_text": instructor_text or 'TBA',
                        "start_time": start_time,
                        "end_time": end_time,
                        "meeting_mode": meeting_time.get('mode') or 'Unknown',
                    }

                    day = str(meeting_time.get('day') or '').strip()
                    if day not in schedule["daily_schedule"]:
                        has_unknown_day = True
                        schedule["unscheduled_classes"].append(class_entry)
                        continue

                    schedule["daily_schedule"][day].append(class_entry)
                    weekly_entry = class_entry.copy()
                    weekly_entry["day"] = day
                    schedule["weekly_schedule"].append(weekly_entry)

                    start_minutes = self._time_to_minutes(start_time)
                    end_minutes = self._time_to_minutes(end_time)
                    if start_minutes >= 24 * 60 or end_minutes >= 24 * 60 or start_minutes >= end_minutes:
                        incomplete_days.add(day)

        if not room_found:
            return None

        for day in days_of_week:
            schedule["daily_schedule"][day].sort(
                key=lambda item: self._time_to_minutes(item["start_time"])
            )

        day_order = {day: index for index, day in enumerate(days_of_week)}
        schedule["weekly_schedule"].sort(
            key=lambda item: (
                day_order.get(item["day"], 99),
                self._time_to_minutes(item["start_time"]),
            )
        )

        schedule["has_incomplete_schedule"] = has_unknown_day or bool(incomplete_days)
        for day in days_of_week:
            classes = schedule["daily_schedule"][day]
            if has_unknown_day or day in incomplete_days:
                status = "Schedule Incomplete"
            elif classes:
                status = "Classes Scheduled"
            else:
                status = "Available All Day"
            schedule["daily_schedule"][day] = {"classes": classes, "status": status}

        return schedule
