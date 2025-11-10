// Rutgers Course Planner - Shared Functions
// This file contains common functions used across multiple templates

// Global variables for course planner
let scheduledCourses = [];
let isPlannerOpen = false;
let currentPopup = null;
let popupTimeout = null;

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
    // Hide any open popups when closing planner
    hideCoursePopup();
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

    // Hide any existing popups when regenerating calendar
    hideCoursePopup();

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

    // Create day overlays for minute-precision course placement
    // Calculate overlay positions based on grid layout (80px time column + 5 equal day columns)
    const timeColumnWidth = 80;
    const dayOverlayWidth = `calc((100% - ${timeColumnWidth}px) / 5)`;
    
    for (let day = 0; day < 5; day++) {
        const overlay = document.createElement('div');
        overlay.className = 'day-overlay';
        overlay.setAttribute('data-day', day);
        overlay.style.left = `calc(${timeColumnWidth}px + ${day} * ${dayOverlayWidth})`;
        overlay.style.width = dayOverlayWidth;
        calendarGrid.appendChild(overlay);
    }

    // Add courses to calendar
    addCoursesToCalendar();
}

function addCoursesToCalendar() {
    console.log('Adding courses to calendar:', scheduledCourses);
    
    // Measure actual row height from the DOM to ensure accuracy
    const firstRow = document.querySelector('.calendar-row');
    if (!firstRow) {
        console.error('Calendar rows not found');
        return;
    }
    
    const actualRowHeight = firstRow.offsetHeight || 45; // Fallback to 45px if measurement fails
    console.log('Measured row height:', actualRowHeight, 'px');
    
    // Constants for minute-precision positioning
    const GRID_START_HOUR = 7; // Calendar starts at 7 AM
    const ROW_HEIGHT_PX = actualRowHeight; // Use actual measured height
    const PX_PER_MIN = ROW_HEIGHT_PX / 60; // Pixels per minute
    
    // Campus color mapping
    function getCampusColor(campusName) {
        if (!campusName) return '#cc0000'; // Default red if no campus
        
        const campus = campusName.trim().toLowerCase();
        
        // Handle various campus name formats
        if (campus.includes('college ave') || campus.includes('college avenue')) {
            return '#dc3545'; // Red
        } else if (campus.includes('busch')) {
            return '#0d6efd'; // Blue
        } else if (campus.includes('livingston')) {
            return '#198754'; // Green
        } else if (campus.includes('cook') || campus.includes('douglass') || campus.includes('doug') || campus.includes('c/d') || campus.includes('d/c')) {
            return '#fd7e14'; // Orange
        } else if (campus.includes('online') || campus.includes('remote')) {
            return '#6f42c1'; // Purple
        }
        
        // Default to red if campus not recognized
        return '#cc0000';
    }
    
    // Helper function to parse time string to minutes from midnight
    function parseTimeToMinutes(timeStr) {
        if (!timeStr || timeStr === 'N/A') return null;
        
        // Parse formats like "9:15 AM", "10:30 PM", "12:00 PM"
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!match) return null;
        
        let hour = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const period = match[3].toUpperCase();
        
        // Convert to 24-hour format
        if (period === 'PM' && hour !== 12) {
            hour += 12;
        } else if (period === 'AM' && hour === 12) {
            hour = 0;
        }
        
        // Return total minutes from midnight
        return hour * 60 + minutes;
    }
    
    // Track intervals per day for overlap detection
    const dayIntervals = {
        0: [], // Monday
        1: [], // Tuesday
        2: [], // Wednesday
        3: [], // Thursday
        4: []  // Friday
    };
    
    const conflicts = [];
    const conflictingMeetings = new Set(); // Track which meetings conflict
    
    // First pass: collect all meeting times and detect conflicts
    scheduledCourses.forEach((course, courseIndex) => {
        if (course.selectedSection && course.selectedSection.meetingTimes) {
            course.selectedSection.meetingTimes.forEach(meeting => {
                const dayMap = { 'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4 };
                const dayIndex = dayMap[meeting.day];
                
                if (dayIndex !== undefined && meeting.startTime && meeting.startTime.formatted) {
                    const startMinutes = parseTimeToMinutes(meeting.startTime.formatted);
                    const endMinutes = meeting.endTime && meeting.endTime.formatted 
                        ? parseTimeToMinutes(meeting.endTime.formatted)
                        : startMinutes + 60; // Default 1 hour if no end time
                    
                    if (startMinutes === null || endMinutes === null) {
                        console.log('Could not parse time:', meeting.startTime.formatted, meeting.endTime?.formatted);
                        return;
                    }
                    
                    // Check for overlap with existing intervals
                    const intervals = dayIntervals[dayIndex];
                    const conflictingInterval = intervals.find(({ start, end, courseInfo }) => {
                        // Check if intervals overlap: !(end <= startMinutes || start >= endMinutes)
                        return !(end <= startMinutes || start >= endMinutes);
                    });
                    
                    if (conflictingInterval) {
                        // Mark both meetings as conflicting
                        const conflictKey = `${dayIndex}-${startMinutes}-${endMinutes}`;
                        const existingConflictKey = `${dayIndex}-${conflictingInterval.start}-${conflictingInterval.end}`;
                        conflictingMeetings.add(conflictKey);
                        conflictingMeetings.add(existingConflictKey);
                        
                        conflicts.push({
                            course: course.courseString,
                            day: meeting.day,
                            time: `${meeting.startTime.formatted} - ${meeting.endTime?.formatted || 'TBA'}`,
                            conflictsWith: conflictingInterval.courseInfo
                        });
                        return; // Don't add to intervals, skip rendering
                    }
                    
                    // Add to intervals
                    intervals.push({
                        start: startMinutes,
                        end: endMinutes,
                        courseInfo: course.courseString
                    });
                }
            });
        }
    });
    
    // Show error notification if conflicts found
    if (conflicts.length > 0) {
        const conflictMessages = conflicts.map(c => 
            `${c.course} (${c.day} ${c.time}) conflicts with ${c.conflictsWith}`
        ).join('; ');
        showNotification(`Schedule conflicts detected: ${conflictMessages}`, 'warning');
    }
    
    // Second pass: render course blocks with minute-precision positioning
    scheduledCourses.forEach(course => {
        if (course.selectedSection && course.selectedSection.meetingTimes) {
            course.selectedSection.meetingTimes.forEach(meeting => {
                const dayMap = { 'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4 };
                const dayIndex = dayMap[meeting.day];
                
                if (dayIndex !== undefined && meeting.startTime && meeting.startTime.formatted) {
                    const startMinutes = parseTimeToMinutes(meeting.startTime.formatted);
                    const endMinutes = meeting.endTime && meeting.endTime.formatted 
                        ? parseTimeToMinutes(meeting.endTime.formatted)
                        : startMinutes + 60;
                    
                    if (startMinutes === null || endMinutes === null) {
                        return;
                    }
                    
                    // Check if this meeting conflicts (skip rendering)
                    const conflictKey = `${dayIndex}-${startMinutes}-${endMinutes}`;
                    if (conflictingMeetings.has(conflictKey)) {
                        return; // Skip rendering conflicting courses
                    }
                    
                    // Calculate position relative to grid start (7 AM)
                    const startMinutesFromGridStart = startMinutes - (GRID_START_HOUR * 60);
                    const durationMinutes = endMinutes - startMinutes;
                    
                    // Only render if within calendar bounds (7 AM to midnight)
                    if (startMinutesFromGridStart < 0 || startMinutesFromGridStart > (24 - GRID_START_HOUR) * 60) {
                        console.log('Meeting time outside calendar bounds:', meeting.startTime.formatted);
                        return;
                    }
                    
                    // Find the day overlay
                    const dayOverlay = document.querySelector(`.day-overlay[data-day="${dayIndex}"]`);
                    
                    if (dayOverlay) {
                        const courseBlock = document.createElement('div');
                        courseBlock.className = 'course-block';
                        
                        // Calculate top position and height in pixels
                        const top = startMinutesFromGridStart * PX_PER_MIN;
                        const height = Math.max(durationMinutes * PX_PER_MIN, 18); // Minimum 18px height
                        
                        // Get campus color based on meeting campus
                        const campusColor = getCampusColor(meeting.campus);
                        
                        courseBlock.style.position = 'absolute';
                        courseBlock.style.top = `${top}px`;
                        courseBlock.style.height = `${height}px`;
                        courseBlock.style.left = '2px';
                        courseBlock.style.right = '2px';
                        courseBlock.style.width = 'auto';
                        courseBlock.style.backgroundColor = campusColor;
                        
                        courseBlock.innerHTML = `
                            <div class="course-title">${course.courseString}</div>
                            <div class="course-time">${meeting.startTime.formatted} - ${meeting.endTime?.formatted || 'TBA'}</div>
                            <div class="course-location">${meeting.building || 'TBA'}</div>
                        `;
                        
                        // Store course and meeting data for popup
                        courseBlock.dataset.courseIndex = scheduledCourses.indexOf(course);
                        courseBlock.dataset.meetingDay = meeting.day;
                        courseBlock.dataset.meetingStartTime = meeting.startTime.formatted;
                        
                        // Add hover event listeners
                        setupCourseBlockHover(courseBlock, course, meeting);
                        
                        dayOverlay.appendChild(courseBlock);
                        console.log(`Added course block: ${course.courseString} at ${top}px, height ${height}px, campus: ${meeting.campus}, color: ${campusColor}`);
                    } else {
                        console.log('Day overlay not found for day:', dayIndex);
                    }
                }
            });
        }
    });
}

// Course Block Hover Popup Functions
function setupCourseBlockHover(courseBlock, course, meeting) {
    let hoverTimeout = null;
    
    courseBlock.addEventListener('mouseenter', function(e) {
        // Clear any existing timeout
        if (hoverTimeout) {
            clearTimeout(hoverTimeout);
        }
        
        // Small delay before showing popup to prevent flickering
        hoverTimeout = setTimeout(() => {
            showCoursePopup(courseBlock, course, meeting, e);
        }, 150);
    });
    
    courseBlock.addEventListener('mouseleave', function(e) {
        // Clear timeout if mouse leaves before popup shows
        if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
        }
        
        // Hide popup after a small delay to allow moving to popup
        if (popupTimeout) {
            clearTimeout(popupTimeout);
        }
        
        popupTimeout = setTimeout(() => {
            // Check if mouse is still over the block or popup
            const popup = document.querySelector('.course-popup');
            if (popup && !popup.matches(':hover') && !courseBlock.matches(':hover')) {
                hideCoursePopup();
            }
        }, 100);
    });
}

function createCoursePopup(course, meeting) {
    // Remove existing popup if any
    if (currentPopup) {
        currentPopup.remove();
    }
    
    const popup = document.createElement('div');
    popup.className = 'course-popup';
    
    // Get campus color for accent
    function getCampusColor(campusName) {
        if (!campusName) return '#cc0000';
        const campus = campusName.trim().toLowerCase();
        if (campus.includes('college ave') || campus.includes('college avenue')) {
            return '#dc3545';
        } else if (campus.includes('busch')) {
            return '#0d6efd';
        } else if (campus.includes('livingston')) {
            return '#198754';
        } else if (campus.includes('cook') || campus.includes('douglass') || campus.includes('doug') || campus.includes('c/d') || campus.includes('d/c')) {
            return '#fd7e14';
        } else if (campus.includes('online') || campus.includes('remote')) {
            return '#6f42c1';
        }
        return '#cc0000';
    }
    
    const campusColor = getCampusColor(meeting.campus);
    
    // Build popup content
    let content = `
        <div class="popup-header" style="border-top-color: ${campusColor};">
            <div class="popup-course-code">${course.courseString}</div>
            <div class="popup-course-title">${course.title || 'N/A'}</div>
        </div>
        <div class="popup-body">
    `;
    
    // Section information
    if (course.selectedSection) {
        const section = course.selectedSection;
        const statusClass = section.status.toLowerCase() === 'open' ? 'status-open' : 'status-closed';
        
        content += `
            <div class="popup-section">
                <div class="popup-section-header">Section Information</div>
                <div class="popup-details-grid">
                    <div class="popup-detail-item">
                        <span class="popup-label">Section:</span>
                        <span class="popup-value">${section.number || 'N/A'}</span>
                    </div>
                    <div class="popup-detail-item">
                        <span class="popup-label">Status:</span>
                        <span class="popup-value ${statusClass}">${section.status || 'N/A'}</span>
                    </div>
                    <div class="popup-detail-item">
                        <span class="popup-label">Index:</span>
                        <span class="popup-value">${section.index || 'N/A'}</span>
                    </div>
                </div>
            </div>
        `;
        
        // Instructor information
        if (section.instructors && section.instructors.length > 0) {
            const instructors = Array.isArray(section.instructors) 
                ? section.instructors.map(inst => typeof inst === 'string' ? inst : inst.name || 'TBA').join(', ')
                : 'TBA';
            content += `
                <div class="popup-section">
                    <div class="popup-section-header">Instructor</div>
                    <div class="popup-value">${instructors}</div>
                </div>
            `;
        }
    }
    
    // Course details
    content += `
            <div class="popup-section">
                <div class="popup-section-header">Course Details</div>
                <div class="popup-details-grid">
                    <div class="popup-detail-item">
                        <span class="popup-label">Credits:</span>
                        <span class="popup-value">${course.creditsDescription || course.credits || 'N/A'}</span>
                    </div>
                    <div class="popup-detail-item">
                        <span class="popup-label">School:</span>
                        <span class="popup-value">${course.school || 'N/A'}</span>
                    </div>
                </div>
            </div>
    `;
    
    // All meeting times
    if (course.selectedSection && course.selectedSection.meetingTimes && course.selectedSection.meetingTimes.length > 0) {
        content += `
            <div class="popup-section">
                <div class="popup-section-header">Schedule</div>
                <div class="popup-meetings">
        `;
        
        course.selectedSection.meetingTimes.forEach(mt => {
            const buildingRoom = mt.room && mt.room !== 'N/A' 
                ? `${mt.building || 'TBA'} ${mt.room}` 
                : (mt.building || 'TBA');
            content += `
                    <div class="popup-meeting-item">
                        <div class="popup-meeting-day">${mt.day || 'N/A'}</div>
                        <div class="popup-meeting-time">${mt.startTime?.formatted || 'TBA'} - ${mt.endTime?.formatted || 'TBA'}</div>
                        <div class="popup-meeting-location">${buildingRoom} ${mt.campus || ''}</div>
                    </div>
            `;
        });
        
        content += `
                </div>
            </div>
        `;
    }
    
    content += `
        </div>
    `;
    
    popup.innerHTML = content;
    
    // Add mouseenter/mouseleave to popup to keep it visible
    popup.addEventListener('mouseenter', function() {
        if (popupTimeout) {
            clearTimeout(popupTimeout);
        }
    });
    
    popup.addEventListener('mouseleave', function() {
        hideCoursePopup();
    });
    
    return popup;
}

function calculatePopupPosition(courseBlock, popup) {
    const blockRect = courseBlock.getBoundingClientRect();
    const calendarGrid = document.getElementById('calendarGrid');
    const gridRect = calendarGrid ? calendarGrid.getBoundingClientRect() : null;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Get actual popup dimensions after it's been added to DOM
    const popupRect = popup.getBoundingClientRect();
    const actualPopupHeight = popupRect.height;
    const actualPopupWidth = popupRect.width;
    const popupOffset = 12; // Space between block and popup
    const viewportPadding = 20; // Padding from viewport edges
    
    let top, left;
    let positionAbove = false;
    let maxHeight = null;
    
    // Calculate available space above and below
    const spaceBelow = viewportHeight - blockRect.bottom - viewportPadding;
    const spaceAbove = blockRect.top - viewportPadding;
    
    // Determine best position (above or below)
    if (spaceBelow < actualPopupHeight && spaceAbove > spaceBelow) {
        // Position above - we have more space above
        positionAbove = true;
        top = blockRect.top - actualPopupHeight - popupOffset;
        
        // If popup would go above viewport, adjust
        if (top < viewportPadding) {
            top = viewportPadding;
            // Calculate max height based on available space above block
            maxHeight = blockRect.top - popupOffset - viewportPadding;
        }
    } else {
        // Position below
        top = blockRect.bottom + popupOffset;
        
        // If popup would go below viewport, adjust
        const bottomEdge = top + actualPopupHeight;
        if (bottomEdge > viewportHeight - viewportPadding) {
            // Calculate max height based on available space below block
            maxHeight = viewportHeight - top - viewportPadding;
            // Ensure we don't go below viewport
            if (maxHeight < 100) {
                // Not enough space below, try positioning above instead
                positionAbove = true;
                top = blockRect.top - popupOffset;
                maxHeight = blockRect.top - viewportPadding;
                // If still not enough space, use viewport height
                if (maxHeight < 100) {
                    top = viewportPadding;
                    maxHeight = viewportHeight - (2 * viewportPadding);
                }
            }
        }
    }
    
    // Ensure top never goes above viewport
    if (top < viewportPadding) {
        top = viewportPadding;
    }
    
    // Calculate horizontal position (centered on block, but adjust if near edges)
    left = blockRect.left + (blockRect.width / 2) - (actualPopupWidth / 2);
    
    // Adjust if popup would go off right edge
    if (left + actualPopupWidth > viewportWidth - viewportPadding) {
        left = viewportWidth - actualPopupWidth - viewportPadding;
    }
    
    // Adjust if popup would go off left edge
    if (left < viewportPadding) {
        left = viewportPadding;
    }
    
    // If grid exists, ensure popup stays within calendar bounds horizontally
    if (gridRect) {
        const gridLeft = Math.max(gridRect.left, viewportPadding);
        const gridRight = Math.min(gridRect.right, viewportWidth - viewportPadding);
        
        if (left < gridLeft) {
            left = gridLeft;
        }
        if (left + actualPopupWidth > gridRight) {
            left = gridRight - actualPopupWidth;
        }
    }
    
    return {
        top: top,
        left: left,
        positionAbove: positionAbove,
        maxHeight: maxHeight
    };
}

function showCoursePopup(courseBlock, course, meeting, event) {
    // Hide any existing popup
    hideCoursePopup();
    
    // Create popup
    const popup = createCoursePopup(course, meeting);
    document.body.appendChild(popup);
    currentPopup = popup;
    
    // Initially position off-screen to measure dimensions
    popup.style.visibility = 'hidden';
    popup.style.top = '-9999px';
    popup.style.left = '-9999px';
    
    // Force a reflow to ensure dimensions are calculated
    void popup.offsetHeight;
    
    // Calculate position based on actual popup dimensions
    const position = calculatePopupPosition(courseBlock, popup);
    
    // Apply position and make visible
    popup.style.top = `${position.top}px`;
    popup.style.left = `${position.left}px`;
    popup.style.visibility = 'visible';
    
    // Apply max-height if needed to fit within viewport
    if (position.maxHeight && position.maxHeight > 0) {
        const popupBody = popup.querySelector('.popup-body');
        if (popupBody) {
            popupBody.style.maxHeight = `${position.maxHeight}px`;
            popupBody.style.overflowY = 'auto';
        }
    }
    
    // Final check: ensure popup doesn't extend beyond viewport bottom
    // Re-measure after positioning to account for any max-height adjustments
    requestAnimationFrame(() => {
        const finalRect = popup.getBoundingClientRect();
        const viewportPadding = 20;
        const maxBottom = window.innerHeight - viewportPadding;
        
        if (finalRect.bottom > maxBottom) {
            const overflow = finalRect.bottom - maxBottom;
            const newTop = Math.max(viewportPadding, position.top - overflow);
            popup.style.top = `${newTop}px`;
            
            // Adjust max-height if we moved the popup
            const popupBody = popup.querySelector('.popup-body');
            if (popupBody && position.maxHeight) {
                const adjustedMaxHeight = position.maxHeight - (position.top - newTop);
                if (adjustedMaxHeight > 100) {
                    popupBody.style.maxHeight = `${adjustedMaxHeight}px`;
                }
            }
        }
    });
    
    // Add class for animation
    popup.classList.add('popup-visible');
}

function hideCoursePopup() {
    if (currentPopup) {
        // Reset max-height before hiding
        const popupBody = currentPopup.querySelector('.popup-body');
        if (popupBody) {
            popupBody.style.maxHeight = '';
            popupBody.style.overflowY = '';
        }
        
        currentPopup.classList.remove('popup-visible');
        // Remove after animation
        setTimeout(() => {
            if (currentPopup && currentPopup.parentNode) {
                currentPopup.parentNode.removeChild(currentPopup);
            }
            currentPopup = null;
        }, 200);
    }
    if (popupTimeout) {
        clearTimeout(popupTimeout);
        popupTimeout = null;
    }
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
    
    // Campus color mapping (same as in addCoursesToCalendar)
    function getCampusColor(campusName) {
        if (!campusName) return '#cc0000'; // Default red if no campus
        
        const campus = campusName.trim().toLowerCase();
        
        // Handle various campus name formats
        if (campus.includes('college ave') || campus.includes('college avenue')) {
            return '#dc3545'; // Red
        } else if (campus.includes('busch')) {
            return '#0d6efd'; // Blue
        } else if (campus.includes('livingston')) {
            return '#198754'; // Green
        } else if (campus.includes('cook') || campus.includes('douglass') || campus.includes('doug') || campus.includes('c/d') || campus.includes('d/c')) {
            return '#fd7e14'; // Orange
        } else if (campus.includes('online') || campus.includes('remote')) {
            return '#6f42c1'; // Purple
        }
        
        // Default to red if campus not recognized
        return '#cc0000';
    }
    
    // Get primary campus from first meeting time, or use first campus location
    function getPrimaryCampus(course) {
        if (course.selectedSection && course.selectedSection.meetingTimes && course.selectedSection.meetingTimes.length > 0) {
            const firstMeeting = course.selectedSection.meetingTimes[0];
            if (firstMeeting.campus) {
                return firstMeeting.campus;
            }
        }
        // Fallback to campusLocations if available
        if (course.campusLocations && course.campusLocations.length > 0) {
            return course.campusLocations[0];
        }
        return null;
    }
    
    coursesList.innerHTML = scheduledCourses.map((course, index) => {
        const primaryCampus = getPrimaryCampus(course);
        const campusColor = getCampusColor(primaryCampus);
        
        return `
        <div class="course-card" style="border-left-color: ${campusColor} !important;">
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
    `;
    }).join('');
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
