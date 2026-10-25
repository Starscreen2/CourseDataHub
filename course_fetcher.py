import logging
import os
import threading
from datetime import datetime, timezone
from typing import Optional, List, Dict

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from rapidfuzz import fuzz
from utils.constants import CAMPUS_ID_TO_NAME
from utils.name_utils import normalize_instructor_name_variants
from utils.fuzzy_utils import get_best_fuzzy_score

logger = logging.getLogger(__name__)


class CourseFetcher:
    # Mapping weekday codes to full names
    WEEKDAY_MAP = {
        "M": "Monday",
        "T": "Tuesday",
        "W": "Wednesday",
        "H": "Thursday",
        "F": "Friday",
        "S": "Saturday",
        "Su": "Sunday"
    }


    def __init__(self):
        # Keep the cache in-process. This avoids a network call while Vercel
        # imports the module and lets warm serverless instances reuse data.
        self.courses_by_params: Dict[str, List[Dict]] = {}
        self.updated_at_by_params: Dict[str, datetime] = {}
        self.last_update = None
        self.base_url = os.environ.get(
            "RUTGERS_COURSES_URL",
            "https://classes.rutgers.edu/soc/api/courses.json",
        )
        self.cache_ttl_seconds = max(
            0, int(os.environ.get("COURSE_CACHE_TTL_SECONDS", "900"))
        )
        self._locks: Dict[str, threading.Lock] = {}

        # Configure requests session with retries
        self.session = requests.Session()
        retry_strategy = Retry(
            total=1,
            backoff_factor=0.25,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=frozenset({"GET"}),
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)

    def convert_to_am_pm(self, military_time: str) -> str:
        """Convert military time to AM/PM format"""
        if not military_time or military_time == "N/A":
            return "N/A"
        try:
            return datetime.strptime(military_time,
                                     "%H%M").strftime("%I:%M %p").lstrip("0")
        except ValueError:
            logger.warning(f"Invalid military time format: {military_time}")
            return "N/A"

    def _mark_refresh_failed(self, param_key: str) -> None:
        """Avoid hammering the upstream API when a stale cache refresh fails."""
        if param_key in self.courses_by_params:
            self.updated_at_by_params[param_key] = datetime.now(timezone.utc)

    def format_weekday(self, day: str) -> str:
        """Convert weekday code to full name"""
        return self.WEEKDAY_MAP.get(day, day)

    def format_campus(self, campus_id: str) -> str:
        """Convert campus ID to campus name"""
        return CAMPUS_ID_TO_NAME.get(campus_id, campus_id)

    def format_meeting_time(self, meeting: Dict) -> Dict:
        """Format meeting time information with proper weekday and campus names"""
        try:
            start_time = meeting.get("startTimeMilitary", "N/A")
            end_time = meeting.get("endTimeMilitary", "N/A")
            day_code = meeting.get("meetingDay", "")
            campus_id = meeting.get("campusLocation", "N/A")

            return {
                "day": self.format_weekday(day_code),
                "start_time": {
                    "military": start_time,
                    "formatted": self.convert_to_am_pm(start_time)
                },
                "end_time": {
                    "military": end_time,
                    "formatted": self.convert_to_am_pm(end_time)
                },
                "building": meeting.get("buildingCode", "N/A"),
                "room": meeting.get("roomNumber", "N/A"),
                "mode": meeting.get("meetingModeDesc", "N/A"),
                "campus": self.format_campus(campus_id),
                "campus_name": self.format_campus(campus_id),
            }
        except Exception as e:
            logger.error(f"Error formatting meeting time: {str(e)}")
            return {
                "day": "N/A",
                "start_time": {
                    "military": "N/A",
                    "formatted": "N/A"
                },
                "end_time": {
                    "military": "N/A",
                    "formatted": "N/A"
                },
                "building": "N/A",
                "room": "N/A",
                "mode": "N/A",
                "campus": "N/A"
            }

    def format_section(self, section: Dict) -> Dict:
        """Format section information with detailed meeting times"""
        try:
            return {
                "number":
                section.get("number", ""),
                "index":
                section.get("index", ""),
                "instructors": [
                    instr.get("name", "") if isinstance(instr, dict) else str(instr)
                    for instr in section.get("instructors", [])
                ],
                "status":
                section.get("openStatusText", ""),
                "comments":
                section.get("commentsText", ""),
                "meeting_times": [
                    self.format_meeting_time(meeting)
                    for meeting in section.get("meetingTimes", [])
                ]
            }
        except Exception as e:
            logger.error(f"Error formatting section: {str(e)}")
            return {
                "number": "Error",
                "index": "",
                "instructors": [],
                "status": "Error loading section",
                "comments": "",
                "meeting_times": []
            }

    def update_courses(self, year="2026", term="1", campus="NB") -> bool:
        """Fetch fresh course data from Rutgers API"""
        # Define param_key before the try block to make it available in exception handlers
        param_key = f"{year}_{term}_{campus}"
        
        try:
            params = {"year": year, "term": term, "campus": campus}
            logger.info(f"Fetching courses with parameters: {params}")

            response = self.session.get(
                self.base_url,
                params=params,
                timeout=(3.05, 10),
            )
            response.raise_for_status()

            courses = response.json()
            if not isinstance(courses, list):
                raise ValueError("Rutgers courses API returned a non-list payload")

            logger.info("Retrieved %s courses from Rutgers API", len(courses))

            if not courses:
                logger.warning("Received empty course list from API")
                return False

            self.courses_by_params[param_key] = sorted(
                courses, key=lambda c: c.get("courseString", ""))
            now = datetime.now(timezone.utc)
            self.updated_at_by_params[param_key] = now
            self.last_update = now.isoformat()
            logger.info("Successfully updated courses at %s", self.last_update)
            return True

        except requests.exceptions.Timeout:
            logger.error("Timeout while fetching courses from API")
            self._mark_refresh_failed(param_key)
            return False
        except requests.exceptions.RequestException as e:
            logger.error("Failed to fetch courses from API: %s", e)
            self._mark_refresh_failed(param_key)
            return False
        except (ValueError, TypeError) as e:
            logger.error("Failed to parse courses API response: %s", e)
            self._mark_refresh_failed(param_key)
            return False
        except Exception as e:
            logger.exception("Unexpected error updating courses: %s", e)
            self._mark_refresh_failed(param_key)
            return False

    def fuzzy_search_courses(self,
                             courses: List[Dict],
                             query: str,
                             threshold: int = 70) -> List[Dict]:
        """Filter and rank courses using fuzzy matching on key fields."""
        results = []
        query = query.lower().strip()
        
        # Check if query matches common patterns for course codes
        is_specific_course_query = False
        subject_part = None
        number_part = None
        
        # Pattern matching for queries like "cs 111", "198:111", "computer science 111"
        # Common department abbreviations
        dept_abbrevs = {
            "cs": "198",  # Computer Science
            "math": "640",  # Mathematics
            "bio": "119",  # Biology
            "chem": "160",  # Chemistry
            "phys": "750",  # Physics
            "stat": "960",  # Statistics
            "econ": "220"   # Economics
        }
        
        # Try to parse common query formats
        query_parts = query.split()
        if len(query_parts) == 2:
            # Format like "cs 111" or "math 152"
            potential_dept, potential_number = query_parts
            if potential_number.isdigit():
                is_specific_course_query = True
                subject_part = dept_abbrevs.get(potential_dept, potential_dept)
                number_part = potential_number
        elif len(query_parts) == 1 and len(query_parts[0].split(":")) == 3:
            # Full Rutgers codes include school, subject, and course number
            # (for example, "01:198:111"). Treat them as specific queries so
            # their shared numeric tokens do not pull in fuzzy lookalikes.
            school_part, subject_part, number_part = query_parts[0].split(":")
            if school_part.isdigit() and subject_part.isdigit() and number_part.isdigit():
                is_specific_course_query = True
        elif ":" in query:
            # Format like "198:111"
            parts = query.split(":")
            if len(parts) == 2 and parts[1].isdigit():
                is_specific_course_query = True
                subject_part = parts[0]
                number_part = parts[1]
        elif query.isdigit():
            # Just a course number like "111"
            is_specific_course_query = True
            number_part = query
        
        # Group courses by their course_string for consistent matching
        course_groups = {}
        exact_matches = []
        high_relevance_matches = []
        
        # Process all courses
        for course in courses:
            course_string = course.get("courseString", "").lower()
            subject = course.get("subject", "").lower()
            course_number = course.get("courseNumber", "").lower()
            title = course.get("title", "").lower()
            subject_description = course.get("subjectDescription", "").lower()
            
            # Aggregate instructor names for the course from its sections
            instructor_names = set()
            try:
                for section in course.get("sections", []) or []:
                    for instr in section.get("instructors", []) or []:
                        raw_name = (instr.get("name", "") or "").strip()
                        if not raw_name:
                            continue
                        # Use utility function to generate all name variants
                        name_variants = normalize_instructor_name_variants(raw_name)
                        instructor_names.update(name_variants)
            except Exception:
                # If structure differs for some rows, skip instructor aggregation silently
                pass
            
            # Store courses by their courseString for grouping
            if course_string not in course_groups:
                course_groups[course_string] = []
            course_groups[course_string].append(course)
            
            # Exact match on course title (Tier 1 - highest priority)
            if query == title:
                exact_matches.append((100, course_string))
                continue
            
            # Special handling for CS (Computer Science) department
            # Common mistake: "cs" searches matching many unrelated courses
            if query == "cs" and subject != "198":
                continue
                
            # If the query exactly matches an instructor full name or a normalized variant, prioritize this course
            if instructor_names and query in instructor_names:
                high_relevance_matches.append((92, course_string))
                # Do not continue; allow other exact matches to contribute as well
            
            # Fuzzy matching for instructor names (handles typos)
            if instructor_names:
                instructor_fuzzy_scores = []
                for instructor_name in instructor_names:
                    # Use utility function to get best fuzzy score
                    best_score = get_best_fuzzy_score(query, instructor_name)
                    instructor_fuzzy_scores.append(best_score)
                
                # If any instructor name has a high fuzzy match, include this course
                max_instructor_score = max(instructor_fuzzy_scores) if instructor_fuzzy_scores else 0
                if max_instructor_score >= 75:  # Lower threshold for instructor fuzzy matching
                    # Add to results with score based on fuzzy match quality
                    results.append((max_instructor_score, course_string))

            # Handle specific course query patterns
            if is_specific_course_query:
                # Perfect match on subject and course number
                if (subject_part and number_part and 
                    subject == subject_part and course_number == number_part and
                    (not (len(query_parts) == 1 and len(query_parts[0].split(":")) == 3)
                     or course_string == query)):
                    exact_matches.append((100, course_string))
                    continue
                    
                # Match on just the course number if that's all we have
                elif (not subject_part and number_part and
                     course_number == number_part):
                    exact_matches.append((95, course_string))
                    continue
                    
                # For dept abbreviation matches like "cs" -> "Computer Science"
                elif (subject_part in dept_abbrevs.keys() and 
                      number_part and 
                      subject == "198" and  # CS department code
                      course_number == number_part):
                    exact_matches.append((98, course_string))
                    continue
                
                # For matches on subject description like "computer science"
                elif (subject_part and number_part and 
                      subject_part in subject_description and 
                      course_number == number_part):
                    high_relevance_matches.append((90, course_string))
                    continue
            
            # Case 1: Exact match on course code
            if query == course_string or query == f"{subject}:{course_number}":
                exact_matches.append((100, course_string))
                continue
            
            # Case 2: Exact match on just course number or subject
            if query == course_number or query == subject:
                high_relevance_matches.append((85, course_string))
                continue
                
            # Skip fuzzy matching if we're doing a specific course search
            # This prevents unrelated courses from showing up
            if is_specific_course_query:
                continue
            
            # Case 3: Fuzzy matching for general searches
            score_course_string = fuzz.token_set_ratio(query, course_string)
            score_title = fuzz.token_set_ratio(query, title)
            score_subject = fuzz.token_set_ratio(query, subject)
            score_course_number = fuzz.token_set_ratio(query, course_number)
            score_subject_desc = fuzz.token_set_ratio(query, subject_description)
            
            # Fuzzy score against instructor names (combined)
            score_instructors = 0
            if instructor_names:
                score_instructors = fuzz.token_set_ratio(query, " ".join(instructor_names))

            max_score = max(score_course_string, score_title, score_subject,
                            score_course_number, score_subject_desc, score_instructors)
                            
            if max_score >= threshold:
                results.append((max_score, course_string))

        # Create a unique set of course strings that matched
        unique_results = {}
        
        # First add exact matches with highest priority
        for score, course_string in exact_matches:
            unique_results[course_string] = score
            
        # Then add high relevance matches
        for score, course_string in high_relevance_matches:
            if course_string not in unique_results or score > unique_results[course_string]:
                unique_results[course_string] = score
        
        # Then add fuzzy matches with lowest priority
        if not is_specific_course_query or len(unique_results) == 0:
            for score, course_string in results:
                if course_string not in unique_results or score > unique_results[course_string]:
                    unique_results[course_string] = score
        
        # Convert back to list and sort by score
        sorted_results = sorted([(score, cs) for cs, score in unique_results.items()], 
                               key=lambda x: x[0], reverse=True)
        
        # Get all courses for each matched course string
        matched_courses = []
        for _, course_string in sorted_results:
            matched_courses.extend(course_groups.get(course_string, []))
            
        logger.info(f"Search for '{query}' found {len(matched_courses)} courses from {len(unique_results)} unique course strings")
        return matched_courses

    def _is_time_in_range(self, military_time: str, time_range: str) -> bool:
        """Check if military time falls within a time range."""
        if not military_time or military_time == "N/A":
            return False
        try:
            time_int = int(military_time)
            hour = time_int // 100
            minute = time_int % 100
            if hour > 23 or minute > 59:
                return False
            total_minutes = hour * 60 + minute
            
            if time_range == 'morning':
                # 8:00 AM (800) to 11:00 AM (1100)
                return 480 <= total_minutes < 660
            elif time_range == 'afternoon':
                # 11:00 AM (1100) to 4:00 PM (1600)
                return 660 <= total_minutes < 960
            elif time_range == 'evening':
                # 4:00 PM (1600) to 10:00 PM (2200)
                return 960 <= total_minutes < 1320
            return False
        except (ValueError, TypeError):
            return False

    def _is_weekend_day(self, day_code: str) -> bool:
        """Check if day code represents a weekend day."""
        return str(day_code).strip().lower() in {'s', 'su'}

    def _matches_course_type(self, meeting_times: List[Dict], course_type: str) -> bool:
        """Check if course matches the specified course type based on meeting times."""
        if not meeting_times:
            return False
        
        for meeting_time in meeting_times:
            mode = str(meeting_time.get('mode') or '').strip().lower()
            
            if course_type == 'traditional':
                # Traditional/Face-to-Face: not online, not hybrid, not remote
                if mode and mode not in {'n/a', 'unknown', 'tba'} and not any(
                    excluded in mode
                    for excluded in ('online', 'hybrid', 'remote', 'asynchronous')
                ):
                    return True
            elif course_type == 'hybrid':
                if 'hybrid' in mode:
                    return True
            elif course_type == 'online':
                # Online & Remote Instruction: online, remote, or asynchronous
                if 'online' in mode or 'remote' in mode or 'asynchronous' in mode:
                    return True
        
        return False

    def apply_filters(self, courses: List[Dict], filters: Dict) -> List[Dict]:
        """Apply filters to a list of courses."""
        if not filters:
            return courses

        filtered_courses = []
        subject_filter_applied = False
        status_filters = {str(value).strip().lower() for value in filters.get('status', [])}
        course_type_filters = {str(value).strip().lower() for value in filters.get('course_type', [])}
        day_filters = [str(value).strip() for value in filters.get('days', []) if str(value).strip()]
        time_filters = [str(value).strip().lower() for value in filters.get('time_range', []) if str(value).strip()]
        campus_filters = [str(value).strip().lower() for value in filters.get('campus', []) if str(value).strip()]
        has_meeting_filters = bool(day_filters or time_filters or campus_filters)
        has_section_filters = bool(status_filters or course_type_filters or has_meeting_filters)
        
        for course in courses:
            # Filter by subject - normalize both values to strings and strip whitespace for comparison
            if 'subject' in filters:
                subject_filter_applied = True
                course_subject = str(course.get('subject', '')).strip()
                filter_subject = str(filters['subject']).strip()
                # Only apply filter if filter_subject is not empty
                if filter_subject and course_subject != filter_subject:
                    continue

            if 'course_number' in filters:
                course_number = str(course.get('courseNumber', '')).strip()
                requested_number = str(filters['course_number']).strip()
                if requested_number and course_number != requested_number:
                    continue
            
            # Filter by school/unit
            if 'school' in filters:
                school_data = course.get('school', {})
                school_code = school_data.get('code', '') if isinstance(school_data, dict) else ''
                school_desc = school_data.get('description', '') if isinstance(school_data, dict) else str(school_data)
                if school_code != filters['school'] and filters['school'] not in school_desc:
                    continue
            
            # Filter by core code
            if 'core_code' in filters:
                core_codes = course.get('coreCodes', [])
                has_core_code = False
                for core in core_codes:
                    if isinstance(core, dict):
                        if core.get('coreCode', core.get('code', '')) == filters['core_code']:
                            has_core_code = True
                            break
                    elif str(core) == filters['core_code']:
                        has_core_code = True
                        break
                if not has_core_code:
                    continue
            
            # Get sections for this course
            sections = [
                section for section in (course.get('sections') or [])
                if isinstance(section, dict)
            ]
            if not sections:
                if has_section_filters:
                    continue
                filtered_courses.append(course)
                continue

            filtered_sections = []
            for section in sections:
                section_status = str(section.get('openStatusText') or section.get('status') or '').strip().lower()
                if status_filters and not any(status in section_status for status in status_filters):
                    continue

                meeting_times_raw = [
                    meeting for meeting in (section.get('meetingTimes') or [])
                    if isinstance(meeting, dict)
                ]
                formatted_meeting_times = [self.format_meeting_time(mt) for mt in meeting_times_raw]

                if course_type_filters and not any(
                    self._matches_course_type(formatted_meeting_times, course_type)
                    for course_type in course_type_filters
                ):
                    continue

                if has_meeting_filters:
                    # Each selected category is an OR group, while day, time,
                    # and campus are ANDed against the same meeting record.
                    matching_meeting_found = False
                    for raw_meeting, meeting in zip(meeting_times_raw, formatted_meeting_times):
                        day_name = str(meeting.get('day', '')).strip()
                        day_code = str(raw_meeting.get('meetingDay', '')).strip()
                        day_name_normalized = day_name.lower()
                        day_code_normalized = day_code.lower()

                        def matches_day(day_filter: str) -> bool:
                            normalized_day = day_filter.lower()
                            if normalized_day == 'weekend':
                                return (
                                    self._is_weekend_day(day_code)
                                    or day_name_normalized in ('saturday', 'sunday')
                                )

                            expected_day = self.WEEKDAY_MAP.get(
                                day_filter,
                                self.WEEKDAY_MAP.get(day_filter.capitalize(), day_filter),
                            )
                            return normalized_day in (
                                day_code_normalized,
                                day_name_normalized,
                                str(expected_day).strip().lower(),
                            )

                        if day_filters and not any(
                            matches_day(day_filter)
                            for day_filter in day_filters
                        ):
                            continue

                        start_time = meeting.get('start_time', {}).get('military', '')
                        if time_filters and not any(
                            self._is_time_in_range(start_time, time_range)
                            for time_range in time_filters
                        ):
                            continue

                        if campus_filters:
                            formatted_campus = str(meeting.get('campus', '')).strip().lower()
                            campus_id_name = str(self.format_campus(raw_meeting.get('campusLocation', ''))).strip().lower()
                            if not any(
                                campus_filter in candidate or candidate in campus_filter
                                for campus_filter in campus_filters
                                for candidate in (formatted_campus, campus_id_name)
                                if candidate
                            ):
                                continue

                        matching_meeting_found = True
                        break

                    if not matching_meeting_found:
                        continue

                filtered_sections.append(section)

            if has_section_filters and not filtered_sections:
                continue

            # Create a copy of the course with filtered sections
            course_copy = course.copy()
            course_copy['sections'] = filtered_sections
            
            # Course passed all filters
            filtered_courses.append(course_copy)
        
        if subject_filter_applied and 'subject' in filters:
            logger.info(f"Subject filter '{filters['subject']}' applied: {len(courses)} courses -> {len(filtered_courses)} courses")
        else:
            logger.info(f"Applied filters to {len(courses)} courses, {len(filtered_courses)} courses remain")
        return filtered_courses

    def get_courses(self,
                    search: Optional[str] = None,
                    year="2026",
                    term="1",
                    campus="NB",
                    filters: Optional[Dict] = None) -> List[Dict]:
        """Get filtered course data with enriched information and fuzzy search."""
        try:
            param_key = f"{year}_{term}_{campus}"

            # Refresh lazily so importing the Flask app is fast and safe on
            # serverless platforms. A per-parameter lock prevents duplicate
            # upstream requests when two requests arrive on a warm instance.
            cached_at = self.updated_at_by_params.get(param_key)
            is_stale = (
                cached_at is None
                or self.cache_ttl_seconds == 0
                or (datetime.now(timezone.utc) - cached_at).total_seconds()
                >= self.cache_ttl_seconds
            )
            if param_key not in self.courses_by_params or is_stale:
                lock = self._locks.setdefault(param_key, threading.Lock())
                with lock:
                    cached_at = self.updated_at_by_params.get(param_key)
                    is_stale = (
                        cached_at is None
                        or self.cache_ttl_seconds == 0
                        or (datetime.now(timezone.utc) - cached_at).total_seconds()
                        >= self.cache_ttl_seconds
                    )
                    if param_key not in self.courses_by_params or is_stale:
                        self.update_courses(year, term, campus)

            if not self.courses_by_params.get(param_key):
                logger.warning(
                    f"No courses available for parameters: year={year}, term={term}, campus={campus}"
                )
                return []

            # Get a copy of the cached courses to avoid modifying the original
            filtered_courses = self.courses_by_params[param_key].copy()

            # Apply filters FIRST to narrow down the dataset before searching
            # This ensures that if a subject filter is set, we only search within that subject
            if filters:
                logger.info(f"Applying filters: {filters}")
                filtered_courses = self.apply_filters(filtered_courses, filters)
                logger.info(f"After filters: {len(filtered_courses)} courses remain")

            # Then apply search on the filtered results
            if search:
                # Use fuzzy search to filter courses
                filtered_courses = self.fuzzy_search_courses(
                    filtered_courses, search)

            # Enrich course data with detailed information
            enriched_courses = []
            for course in filtered_courses:
                try:
                    school_data = course.get("school") or {}
                    school = (
                        school_data.get("description", "")
                        if isinstance(school_data, dict)
                        else str(school_data)
                    )
                    credits_data = course.get("creditsObject") or {}
                    campus_locations = []
                    for location in course.get("campusLocations", []) or []:
                        if isinstance(location, dict):
                            campus_locations.append(location.get("description", ""))
                        elif location:
                            campus_locations.append(str(location))
                    core_requirements = []
                    for core in course.get("coreCodes", []) or []:
                        if isinstance(core, dict):
                            core_requirements.append({
                                "code": core.get("coreCode", core.get("code", "")),
                                "description": core.get(
                                    "coreCodeDescription", core.get("description", "")
                                ),
                            })
                        elif core:
                            core_requirements.append({"code": str(core), "description": ""})

                    enriched_course = {
                        "courseString": course.get("courseString", ""),
                        "title": course.get("title", ""),
                        "subject": course.get("subject", ""),
                        "subjectDescription": course.get("subjectDescription", ""),
                        "course_number": course.get("courseNumber", ""),
                        "courseNumber": course.get("courseNumber", ""),
                        "description": course.get("courseDescription", ""),
                        "credits": course.get("credits", ""),
                        "creditsDescription": credits_data.get("description", "") if isinstance(credits_data, dict) else str(credits_data),
                        "school": school,
                        "campusLocations": campus_locations,
                        "prerequisites": course.get("preReqNotes", ""),
                        "coreRequirements": core_requirements,
                        "coreCodes": core_requirements,
                        "sections": [
                            self.format_section(section) for section in course.get("sections", [])
                        ]
                    }
                    
                    enriched_courses.append(enriched_course)

                except Exception as e:
                    logger.error(f"Error enriching course data: {str(e)}")
                    continue


            logger.info(
                f"Returning {len(enriched_courses)} enriched courses for search: '{search}'"
            )
            return enriched_courses
        except Exception as e:
            logger.error(f"Error getting courses: {str(e)}")
            return []
