// Rutgers Course Planner - Shared Functions
// This file contains common functions used across multiple templates

// Global variables for course planner
let scheduledCourses = [];
let isPlannerOpen = false;

// Load scheduled courses from localStorage on page load
document.addEventListener('DOMContentLoaded', function() {
    const stored = localStorage.getItem('scheduledCourses');
    if (stored) {
        try {
            scheduledCourses = JSON.parse(stored);
        } catch (e) {
            console.error('Error loading scheduled courses:', e);
            scheduledCourses = [];
        }
    }
});

// Floating Button Functions
function showFloatingButton() {
    setTimeout(() => {
        const floatingButton = document.getElementById('floatingPlanner');
        if (floatingButton) {
            floatingButton.style.opacity = '1';
            floatingButton.style.transform = 'translateY(0)';
        }
    }, 1000);
}

// Planner Popup Functions
function togglePlanner() {
    if (isPlannerOpen) {
        closePlanner();
    } else {
        openPlanner();
    }
}

function openPlanner() {
    isPlannerOpen = true;
    const plannerPopup = document.getElementById('plannerPopup');
    if (plannerPopup) {
        plannerPopup.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        updatePlannerUI();
        
        // Always generate calendar grid when opening planner
        setTimeout(() => {
            generateCalendarGrid();
        }, 100);
    }
}

function closePlanner() {
    isPlannerOpen = false;
    const plannerPopup = document.getElementById('plannerPopup');
    if (plannerPopup) {
        plannerPopup.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

function openCoursePlanner() {
    // Open the integrated course planner
    openPlanner();
}

// Export Functions
function exportSchedule() {
    if (scheduledCourses.length === 0) {
        showNotification('No courses to export', 'warning');
        return;
    }

    // Create a formatted schedule export
    const scheduleData = {
        courses: scheduledCourses,
        exportDate: new Date().toISOString(),
        totalCourses: scheduledCourses.length
    };

    const dataStr = JSON.stringify(scheduleData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `rutgers-schedule-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    showNotification('Schedule exported successfully!', 'success');
}

// View Management
function switchView(view) {
    const calendarView = document.getElementById('calendarView');
    const listView = document.getElementById('listView');
    const calendarBtn = document.getElementById('calendarViewBtn');
    const listBtn = document.getElementById('listViewBtn');

    if (view === 'calendar') {
        if (calendarView) calendarView.style.display = 'block';
        if (listView) listView.style.display = 'none';
        if (calendarBtn) calendarBtn.classList.add('active');
        if (listBtn) listBtn.classList.remove('active');
        generateCalendarGrid();
    } else {
        if (calendarView) calendarView.style.display = 'none';
        if (listView) listView.style.display = 'block';
        if (listBtn) listBtn.classList.add('active');
        if (calendarBtn) calendarBtn.classList.remove('active');
    }
}

// Calendar Functions
function generateCalendarGrid() {
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) return;

    // Clear existing grid
    calendarGrid.innerHTML = '';

    // Generate time slots from 7 AM to 12 AM (midnight)
    const timeSlots = [];
    for (let hour = 7; hour <= 24; hour++) {
        if (hour === 24) {
            timeSlots.push('12:00 AM');
        } else if (hour === 12) {
            timeSlots.push('12:00 PM');
        } else if (hour > 12) {
            timeSlots.push(`${hour - 12}:00 PM`);
        } else {
            timeSlots.push(`${hour}:00 AM`);
        }
    }

    // Create calendar rows
    timeSlots.forEach(time => {
        const row = document.createElement('div');
        row.className = 'calendar-row';
        
        // Time label
        const timeLabel = document.createElement('div');
        timeLabel.className = 'time-label';
        timeLabel.textContent = time;
        row.appendChild(timeLabel);

        // Day cells
        for (let day = 0; day < 5; day++) {
            const cell = document.createElement('div');
            cell.className = 'day-cell';
            cell.setAttribute('data-day', day);
            cell.setAttribute('data-time', time);
            row.appendChild(cell);
        }

        calendarGrid.appendChild(row);
    });

    // Add courses to calendar
    addCoursesToCalendar();
}

function addCoursesToCalendar() {
    console.log('Adding courses to calendar:', scheduledCourses);
    
    scheduledCourses.forEach(course => {
        if (course.selectedSection && course.selectedSection.meetingTimes) {
            course.selectedSection.meetingTimes.forEach(meeting => {
                const dayMap = { 'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4 };
                const dayIndex = dayMap[meeting.day];
                if (dayIndex !== undefined) {
                    const timeSlot = meeting.startTime.formatted;
                    console.log('Looking for cell:', dayIndex, timeSlot);
                    
                    // Try to find the cell with the exact time match
                    let cell = document.querySelector(`[data-day="${dayIndex}"][data-time="${timeSlot}"]`);
                    
                    // If not found, try to find the closest time slot
                    if (!cell) {
                        const allCells = document.querySelectorAll(`[data-day="${dayIndex}"]`);
                        for (let i = 0; i < allCells.length; i++) {
                            const cellTime = allCells[i].dataset.time;
                            if (cellTime && cellTime.includes(timeSlot.split(' ')[0])) {
                                cell = allCells[i];
                                break;
                            }
                        }
                    }
                    
                    if (cell) {
                        console.log('Found cell, adding course block');
                        const courseBlock = document.createElement('div');
                        courseBlock.className = 'course-block';
                        courseBlock.innerHTML = `
                            <div class="course-title">${course.courseString}</div>
                            <div class="course-time">${meeting.startTime.formatted} - ${meeting.endTime.formatted}</div>
                            <div class="course-location">${meeting.building}</div>
                        `;
                        cell.appendChild(courseBlock);
                    } else {
                        console.log('Cell not found for:', dayIndex, timeSlot);
                    }
                }
            });
        }
    });
}

// Link Functions
function copyScheduleLink() {
    const scheduleData = JSON.stringify(scheduledCourses);
    const encodedData = encodeURIComponent(scheduleData);
    const link = `${window.location.origin}${window.location.pathname}?schedule=${encodedData}`;
    
    navigator.clipboard.writeText(link).then(() => {
        showNotification('Schedule link copied to clipboard!', 'success');
    }).catch(() => {
        showNotification('Failed to copy link', 'error');
    });
}

function clearSchedule() {
    if (confirm('Are you sure you want to clear your entire schedule?')) {
        scheduledCourses.length = 0;
        localStorage.setItem('scheduledCourses', JSON.stringify(scheduledCourses));
        updatePlannerUI();
        showNotification('Schedule cleared', 'info');
    }
}

// UI Update Functions
function updatePlannerUI() {
    const courseCount = scheduledCourses.length;
    const courseCountBadge = document.getElementById('courseCountBadge');
    const courseCountSpan = document.getElementById('courseCount');
    const tooltipText = document.getElementById('tooltipText');
    const plannerSubtitle = document.getElementById('plannerSubtitle');
    const emptyState = document.getElementById('emptyState');
    const courseList = document.getElementById('courseList');

    // Check if planner popup is open before updating UI elements
    if (!isPlannerOpen) {
        return;
    }

    // Update course count with null checks
    if (courseCountSpan) {
        courseCountSpan.textContent = courseCount;
    }
    
    if (courseCount > 0) {
        if (courseCountBadge) {
            courseCountBadge.style.display = 'block';
        }
        if (tooltipText) {
            tooltipText.textContent = `View ${courseCount} course${courseCount !== 1 ? 's' : ''} in your schedule`;
        }
    } else {
        if (courseCountBadge) {
            courseCountBadge.style.display = 'none';
        }
        if (tooltipText) {
            tooltipText.textContent = 'Open Calendar';
        }
    }

    // Update planner subtitle with null check
    if (plannerSubtitle) {
        plannerSubtitle.textContent = `${courseCount} course${courseCount !== 1 ? 's' : ''} scheduled`;
    }

    // Show/hide content based on course count with null checks
    if (courseCount > 0) {
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        if (courseList) {
            courseList.style.display = 'block';
        }
        updateCourseList();
        updateStats();
    } else {
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        if (courseList) {
            courseList.style.display = 'none';
        }
    }
    
    // Always regenerate calendar if in calendar view
    const calendarView = document.getElementById('calendarView');
    if (calendarView && calendarView.style.display !== 'none') {
        generateCalendarGrid();
    }
}

function updateCourseList() {
    const coursesList = document.getElementById('scheduledCoursesList');
    if (!coursesList) return;
    
    coursesList.innerHTML = scheduledCourses.map((course, index) => `
        <div class="course-card">
            <div class="course-header">
                <h5>${course.courseString} - ${course.title}</h5>
                <button class="btn btn-sm btn-outline-danger" onclick="removeCourse(${index})">
                    <i class="bi bi-x"></i>
                </button>
            </div>
            <div class="course-details">
                <p><strong>Subject:</strong> ${course.subject} - ${course.subjectDescription || course.subject}</p>
                <p><strong>Credits:</strong> ${course.creditsDescription || course.credits}</p>
                <p><strong>School:</strong> ${course.school || 'N/A'}</p>
                ${course.selectedSection ? `
                    <div class="section-info mt-3">
                        <div class="d-flex gap-2 mb-2">
                            <span class="badge bg-primary">Section ${course.selectedSection.number}</span>
                            <span class="badge ${course.selectedSection.status.toLowerCase() === 'open' ? 'bg-success' : 'bg-danger'}">${course.selectedSection.status}</span>
                            <span class="badge bg-info">Index: ${course.selectedSection.index}</span>
                        </div>
                        <p class="mb-1"><strong>Instructor:</strong> ${course.selectedSection.instructors.join(', ')}</p>
                        ${course.selectedSection.meetingTimes && course.selectedSection.meetingTimes.length > 0 ? `
                            <div class="meeting-times">
                                <strong>Schedule:</strong><br>
                                ${course.selectedSection.meetingTimes.map(time => `
                                    <small class="text-muted">
                                        ${time.day} ${time.startTime.formatted} - ${time.endTime.formatted}<br>
                                        ${time.building} ${time.campus}
                                    </small>
                                `).join('<br>')}
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function updateStats() {
    const totalCoursesEl = document.getElementById('totalCourses');
    const campusCountEl = document.getElementById('campusCount');
    const timeConflictsEl = document.getElementById('timeConflicts');
    
    if (totalCoursesEl) {
        totalCoursesEl.textContent = scheduledCourses.length;
    }
    
    // Calculate unique campuses
    const campuses = new Set(scheduledCourses.map(c => c.campusLocations?.[0] || 'Unknown'));
    if (campusCountEl) {
        campusCountEl.textContent = campuses.size;
    }
    
    // Time conflicts (simplified - you can implement more complex logic)
    if (timeConflictsEl) {
        timeConflictsEl.textContent = '0';
    }
}

// Course Management Functions
function addCourseToPlanner(course) {
    // Check if this specific section already exists
    const exists = scheduledCourses.some(c => 
        c.courseString === course.courseString && 
        c.selectedSection && 
        course.selectedSection && 
        c.selectedSection.index === course.selectedSection.index
    );
    
    if (exists) {
        showNotification('This section is already in your planner!', 'warning');
        return;
    }

    // Add course to planner
    scheduledCourses.push(course);
    localStorage.setItem('scheduledCourses', JSON.stringify(scheduledCourses));
    updatePlannerUI();
    
    // Show success message
    const sectionInfo = course.selectedSection ? ` (Section ${course.selectedSection.number})` : '';
    showNotification(`Course added to planner${sectionInfo}!`, 'success');
}

function removeCourse(index) {
    scheduledCourses.splice(index, 1);
    localStorage.setItem('scheduledCourses', JSON.stringify(scheduledCourses));
    updatePlannerUI();
    showNotification('Course removed from planner', 'info');
}

// Utility Functions
function showNotification(message, type = 'info') {
    // Create a simple notification
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// Initialize floating button on page load
document.addEventListener('DOMContentLoaded', function() {
    showFloatingButton();
    
    // Initialize calendar grid
    setTimeout(() => {
        generateCalendarGrid();
    }, 200);
});
