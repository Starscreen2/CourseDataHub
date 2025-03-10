import logging
from typing import Dict, List, Optional
from course_fetcher import CourseFetcher
from rapidfuzz import fuzz, process

class RoomFetcher:
    """
    A class to search, filter, and retrieve room information and availability
    based on course data provided by the CourseFetcher class.
    """

    def __init__(self, course_fetcher: CourseFetcher):
        """Initialize the RoomFetcher with a course fetcher instance"""
        self.course_fetcher = course_fetcher
        self.logger = logging.getLogger(__name__)

    def _extract_rooms_from_courses(self, courses: List[Dict]) -> List[Dict]:
        """
        Extract and deduplicate room information from course data.
        Returns a list of unique rooms with their details.
        """
        rooms = {}
        
        for course in courses:
            for section in course.get('sections', []):
                for meeting_time in section.get('meeting_times', []):
                    # Skip online or missing location courses
                    if not meeting_time.get('building') or not meeting_time.get('room'):
                        continue
                    
                    building = meeting_time.get('building', '')
                    room_number = meeting_time.get('room', '')
                    campus = meeting_time.get('campus', '')
                    
                    # Create unique key for room
                    room_key = f"{building}_{room_number}"
                    
                    if room_key not in rooms:
                        rooms[room_key] = {
                            'building': building,
                            'room': room_number,
                            'campus': campus,
                            'full_name': f"{building} {room_number}",
                            'building_name': meeting_time.get('building_name', building),
                        }
        
        return list(rooms.values())

    def get_all_rooms(self, year="2025", term="1", campus="NB") -> List[Dict]:
        """
        Retrieve a list of all unique rooms from the course data.
        """
        courses = self.course_fetcher.get_courses(year=year, term=term, campus=campus)
        return self._extract_rooms_from_courses(courses)

    def search_rooms(self, query: str, year="2025", term="1", campus="NB") -> List[Dict]:
        """
        Search for rooms matching the given query using fuzzy matching.
        """
        all_rooms = self.get_all_rooms(year, term, campus)
        
        if not query:
            return all_rooms
        
        # Prepare search fields and weights
        search_fields = [
            ('full_name', 100),      # Highest weight for full room name
            ('building', 90),        # High weight for building code
            ('building_name', 85),   # Also high weight for building name
            ('room', 80),            # Medium weight for room number
        ]
        
        scored_rooms = []
        
        for room in all_rooms:
            max_score = 0
            
            for field, weight in search_fields:
                if field in room:
                    # Normalize to string for fuzzy matching
                    field_value = str(room[field]).lower()
                    query_lower = query.lower()
                    
                    # Calculate scores with different fuzzy algorithms
                    ratio_score = fuzz.ratio(query_lower, field_value) 
                    partial_score = fuzz.partial_ratio(query_lower, field_value)
                    token_sort_score = fuzz.token_sort_ratio(query_lower, field_value)
                    
                    # Use the highest score
                    field_score = max(ratio_score, partial_score, token_sort_score)
                    
                    # Apply field weight and keep the highest overall score
                    weighted_score = (field_score * weight) / 100
                    max_score = max(max_score, weighted_score)
            
            # Only include rooms that meet the threshold
            if max_score >= 60:  # Adjust threshold as needed
                scored_rooms.append((room, max_score))
        
        # Sort by score descending
        sorted_rooms = [room for room, score in sorted(scored_rooms, key=lambda x: x[1], reverse=True)]
        
        return sorted_rooms

    def get_room_schedule(self, building: str, room: str, year="2025", term="1", campus="NB") -> Dict:
        """
        Get the schedule for a specific room, organized by day and time.
        """
        courses = self.course_fetcher.get_courses(year=year, term=term, campus=campus)
        
        # Initialize the schedule structure
        days_of_week = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        schedule = {
            "room_info": {
                "building": building,
                "room": room,
                "full_name": f"{building} {room}",
            },
            "daily_schedule": {day: [] for day in days_of_week},
            "weekly_schedule": []
        }
        
        # Get all classes in this room
        for course in courses:
            for section in course.get('sections', []):
                for meeting_time in section.get('meeting_times', []):
                    if (meeting_time.get('building') == building and 
                        meeting_time.get('room') == room and
                        meeting_time.get('day')):  # Only include meetings with a defined day
                        
                        day = meeting_time.get('day')
                        
                        # Create class entry
                        class_entry = {
                            "course_name": course.get('title', 'Unknown'),
                            "course_code": course.get('courseString', 'Unknown'),
                            "section": section.get('number', 'Unknown'),
                            "instructor": section.get('instructorsText', 'TBA'),
                            "start_time": meeting_time.get('start_time', {}).get('formatted', 'TBA'),
                            "end_time": meeting_time.get('end_time', {}).get('formatted', 'TBA'),
                            "meeting_mode": meeting_time.get('mode', 'Unknown'),
                        }
                        
                        # Add to daily schedule
                        if day in schedule["daily_schedule"]:
                            schedule["daily_schedule"][day].append(class_entry)
                        
                        # Also add to the weekly schedule list
                        weekly_entry = class_entry.copy()
                        weekly_entry["day"] = day
                        schedule["weekly_schedule"].append(weekly_entry)
        
        # Sort each day's classes by start time
        for day in schedule["daily_schedule"]:
            schedule["daily_schedule"][day].sort(
                key=lambda x: x["start_time"] if x["start_time"] != "TBA" else "23:59"
            )
        
        # Sort weekly schedule by day and then start time
        day_order = {day: i for i, day in enumerate(days_of_week)}
        schedule["weekly_schedule"].sort(
            key=lambda x: (
                day_order.get(x["day"], 99),  # Sort by day order
                x["start_time"] if x["start_time"] != "TBA" else "23:59"  # Then by start time
            )
        )
        
        # Add availability status for each day
        for day in days_of_week:
            classes = schedule["daily_schedule"][day]
            if not classes:
                schedule["daily_schedule"][day] = {"classes": [], "status": "Available All Day"}
            else:
                schedule["daily_schedule"][day] = {"classes": classes, "status": "Classes Scheduled"}
        
        return schedule