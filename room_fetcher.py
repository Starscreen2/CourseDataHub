import logging
from datetime import datetime
from typing import List, Dict, Optional
from course_fetcher import CourseFetcher

logger = logging.getLogger(__name__)

class RoomFetcher:
    """
    A class to search, filter, and retrieve room information and availability
    based on course data provided by the CourseFetcher class.
    """
    
    def __init__(self, course_fetcher: CourseFetcher):
        """Initialize the RoomFetcher with a course fetcher instance"""
        self.course_fetcher = course_fetcher
        self.rooms_cache = {}  # Cache for room data by param combination
        
    def _extract_rooms_from_courses(self, courses: List[Dict]) -> List[Dict]:
        """
        Extract and deduplicate room information from course data.
        Returns a list of unique rooms with their details.
        """
        all_rooms = []
        room_keys = set()  # Track unique building/room combinations
        
        for course in courses:
            for section in course.get("sections", []):
                for meeting_time in section.get("meeting_times", []):
                    # Skip if building or room is N/A or empty
                    if (meeting_time.get("building") in ["N/A", ""] or 
                        meeting_time.get("room") in ["N/A", ""]):
                        continue
                    
                    # Create a unique key for this room
                    room_key = f"{meeting_time.get('building')}_{meeting_time.get('room')}_{meeting_time.get('campus')}"
                    
                    if room_key not in room_keys:
                        room_keys.add(room_key)
                        all_rooms.append({
                            "building": meeting_time.get("building"),
                            "room": meeting_time.get("room"),
                            "campus": meeting_time.get("campus"),
                            "full_name": f"{meeting_time.get('building')} {meeting_time.get('room')}",
                        })
        
        # Sort rooms by building, then room number
        return sorted(all_rooms, key=lambda x: (x.get("building", ""), x.get("room", "")))
    
    def get_all_rooms(self, year="2025", term="1", campus="NB") -> List[Dict]:
        """
        Retrieve a list of all unique rooms from the course data.
        """
        param_key = f"{year}_{term}_{campus}"
        
        # Check if we already have the rooms in cache
        if param_key in self.rooms_cache:
            return self.rooms_cache[param_key]
        
        # Get all courses to extract room information
        courses = self.course_fetcher.get_courses(search=None, year=year, term=term, campus=campus)
        
        # Extract unique rooms
        rooms = self._extract_rooms_from_courses(courses)
        
        # Cache the results
        self.rooms_cache[param_key] = rooms
        
        logger.info(f"Found {len(rooms)} unique rooms for {param_key}")
        return rooms
    
    def search_rooms(self, query: str, year="2025", term="1", campus="NB") -> List[Dict]:
        """
        Search for rooms matching the given query.
        """
        if not query:
            return self.get_all_rooms(year, term, campus)
        
        # Get all rooms first
        all_rooms = self.get_all_rooms(year, term, campus)
        
        # Filter rooms based on query
        query = query.lower()
        filtered_rooms = [
            room for room in all_rooms if (
                query in room.get("building", "").lower() or
                query in room.get("room", "").lower() or
                query in room.get("full_name", "").lower() or
                query in room.get("campus", "").lower()
            )
        ]
        
        return filtered_rooms
    
    def get_room_schedule(self, building: str, room: str, year="2025", term="1", campus="NB") -> Dict:
        """
        Get the schedule for a specific room, organized by day and time.
        """
        if not building or not room:
            return {
                "building": building,
                "room": room,
                "schedule": {},
                "error": "Building and room must be specified"
            }
        
        # Get all courses
        courses = self.course_fetcher.get_courses(search=None, year=year, term=term, campus=campus)
        
        # Find all sections that use this room
        room_schedule = {
            "building": building,
            "room": room,
            "schedule": {
                "Monday": [],
                "Tuesday": [],
                "Wednesday": [],
                "Thursday": [],
                "Friday": [],
                "Saturday": [],
                "Sunday": []
            },
            "occupancy_hours": {}
        }
        
        for course in courses:
            course_string = course.get("courseString", "")
            course_title = course.get("title", "")
            
            for section in course.get("sections", []):
                section_number = section.get("number", "")
                instructors = section.get("instructors", [])
                
                for meeting_time in section.get("meeting_times", []):
                    # Check if this meeting is in the requested room
                    if (meeting_time.get("building") == building and 
                        meeting_time.get("room") == room):
                        
                        day = meeting_time.get("day", "")
                        if not day or day == "N/A" or day not in room_schedule["schedule"]:
                            continue
                        
                        start_time = meeting_time.get("start_time", {}).get("formatted", "")
                        end_time = meeting_time.get("end_time", {}).get("formatted", "")
                        start_military = meeting_time.get("start_time", {}).get("military", "")
                        end_military = meeting_time.get("end_time", {}).get("military", "")
                        
                        # Skip if no valid times
                        if not start_time or not end_time or start_time == "N/A" or end_time == "N/A":
                            continue
                        
                        # Add to the schedule for this day
                        room_schedule["schedule"][day].append({
                            "course": course_string,
                            "title": course_title,
                            "section": section_number,
                            "start_time": start_time,
                            "end_time": end_time,
                            "start_military": start_military,
                            "end_military": end_military,
                            "instructors": instructors
                        })
        
        # Sort each day's schedule by start time
        for day in room_schedule["schedule"]:
            room_schedule["schedule"][day] = sorted(
                room_schedule["schedule"][day],
                key=lambda x: x.get("start_military", "0000")
            )
            
            # Calculate occupancy hours
            if room_schedule["schedule"][day]:
                room_schedule["occupancy_hours"][day] = {
                    "first_class": room_schedule["schedule"][day][0]["start_time"],
                    "last_class": room_schedule["schedule"][day][-1]["end_time"]
                }
        
        return room_schedule