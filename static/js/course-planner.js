// Rutgers Course Planner - Shared Functions
// This file contains common functions used across multiple templates

// Global variables for course planner
let scheduledCourses = [];
let isPlannerOpen = false;
let detailPanel = null;
let detailPanelBody = null;
let detailPanelEmptyState = null;
let detailPanelCourseIndex = null;
let detailPanelTitle = null;
let detailPanelSubtitle = null;
let detailPanelBackButton = null;
let detailPanelMode = 'details';

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
        ensureDetailPanel();
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
    // Hide any open detail panels when closing planner
    closeDetailPanel();
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
    scheduledCourses.forEach((course, courseIndex) => {
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
                        courseBlock.dataset.courseIndex = courseIndex;
                        courseBlock.dataset.meetingDay = meeting.day;
                        courseBlock.dataset.meetingStartTime = meeting.startTime.formatted;
                        
                        // Add hover event listeners
                        setupCourseBlockHover(courseBlock, courseIndex);
                        
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
function setupCourseBlockHover(courseBlock, courseIndex) {
    if (!courseBlock) return;
    courseBlock.setAttribute('tabindex', '0');
    courseBlock.addEventListener('click', function(e) {
        e.stopPropagation();
        showCoursePopup(courseBlock, scheduledCourses[courseIndex], null, e, courseIndex);
    });
    courseBlock.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showCoursePopup(courseBlock, scheduledCourses[courseIndex], null, e, courseIndex);
        }
    });
}

function createCoursePopup(course, meeting, options = {}) {
    const { forPanel = false, courseIndex = null } = options;

    const popup = document.createElement('div');
    popup.className = 'course-popup';
    if (forPanel) {
        popup.classList.add('panel-mode');
    }
    
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
    
    const fallbackMeeting = meeting || (course.selectedSection?.meetingTimes?.[0]) || {};
    const campusColor = getCampusColor(fallbackMeeting.campus);
    
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
                        <span class="popup-value"><button class="badge bg-primary section-switcher-btn" type="button" data-popup="true">Section ${section.number || 'N/A'}</button></span>
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
    
    const switchBtn = popup.querySelector('.section-switcher-btn[data-popup="true"]');
    if (switchBtn) {
        switchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = typeof courseIndex === 'number' ? courseIndex : scheduledCourses.indexOf(course);
            if (!Number.isNaN(idx) && idx >= 0) {
                showSectionSelector(idx);
            }
        });
    }
    
    return popup;
}

function showCoursePopup(courseBlock, course, meeting, event, courseIndexOverride) {
    const idx = typeof courseIndexOverride === 'number' ? courseIndexOverride : scheduledCourses.indexOf(course);
    if (idx === -1) {
        return;
    }
    showCourseDetail(idx);
}

// Link Functions
function generateWebRegLink() {
    // Get year and term from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    let year = urlParams.get('year');
    let term = urlParams.get('term');
    
    // Fallback: try to get from data attributes if available
    if (!year || !term) {
        const yearEl = document.querySelector('[data-year]');
        const termEl = document.querySelector('[data-term]');
        if (yearEl) year = yearEl.getAttribute('data-year');
        if (termEl) term = termEl.getAttribute('data-term');
    }
    
    // Fallback: try to get from form select elements (for select.html)
    if (!year || !term) {
        const yearSelect = document.getElementById('year');
        const termSelect = document.getElementById('term');
        if (yearSelect && yearSelect.value) year = yearSelect.value;
        if (termSelect && termSelect.value) term = termSelect.value;
    }
    
    // Default values if still not found
    if (!year) year = '2026';
    if (!term) term = '1';
    
    // Construct semesterSelection: term + year (e.g., "1" + "2026" = "12026")
    const semesterSelection = term + year;
    
    // Collect all indices from scheduledCourses
    const indices = [];
    scheduledCourses.forEach(course => {
        if (course.selectedSection && course.selectedSection.index) {
            indices.push(course.selectedSection.index);
        }
    });
    
    if (indices.length === 0) {
        showNotification('No courses in your schedule to register', 'warning');
        return null;
    }
    
    // Build the WebReg URL
    const indexList = indices.join(',');
    const webRegUrl = `https://sims.rutgers.edu/webreg/editSchedule.htm?login=cas&semesterSelection=${semesterSelection}&indexList=${indexList}`;
    
    return webRegUrl;
}

function openWebReg() {
    const url = generateWebRegLink();
    if (url) {
        window.open(url, '_blank');
    }
}

function copyScheduleLink() {
    const webRegUrl = generateWebRegLink();
    if (!webRegUrl) {
        return; // generateWebRegLink already shows a notification if no courses
    }
    
    navigator.clipboard.writeText(webRegUrl).then(() => {
        showNotification('WebReg link copied to clipboard!', 'success');
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

    refreshDetailPanel();
}

// Detail panel helpers
function ensureDetailPanel() {
    if (detailPanel) {
        return detailPanel;
    }
    detailPanel = document.getElementById('plannerDetailPanel');
    if (!detailPanel) {
        return null;
    }
    detailPanelBody = detailPanel.querySelector('.detail-panel-body');
    detailPanelEmptyState = detailPanel.querySelector('.detail-panel-empty');
    detailPanelTitle = detailPanel.querySelector('.detail-panel-title');
    detailPanelSubtitle = detailPanel.querySelector('.detail-panel-subtitle');
    detailPanelBackButton = detailPanel.querySelector('.detail-panel-back');
    if (detailPanelBackButton && !detailPanelBackButton.dataset.bound) {
        detailPanelBackButton.addEventListener('click', () => {
            if (detailPanelCourseIndex != null) {
                showCourseDetail(detailPanelCourseIndex);
            } else {
                updateDetailPanelHeader('details', null);
            }
        });
        detailPanelBackButton.dataset.bound = 'true';
    }
    if (detailPanelBackButton) {
        detailPanelBackButton.setAttribute('aria-hidden', 'true');
        detailPanelBackButton.tabIndex = -1;
    }
    const closeBtn = detailPanel.querySelector('.detail-panel-close');
    if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.addEventListener('click', () => {
            closeDetailPanel();
        });
        closeBtn.dataset.bound = 'true';
    }
    detailPanel.dataset.mode = detailPanel.dataset.mode || 'details';
    return detailPanel;
}

function updateDetailPanelHeader(mode, course) {
    detailPanelMode = mode;
    const panel = ensureDetailPanel();
    if (!panel) return;
    panel.dataset.mode = mode;
    if (detailPanelTitle) {
        if (mode === 'sections') {
            detailPanelTitle.textContent = 'Select a Section';
            if (detailPanelSubtitle) {
                const courseLabel = course?.courseString ? `${course.courseString} • ` : '';
                detailPanelSubtitle.textContent = `${courseLabel}Hover to preview on the calendar, click to switch.`.trim();
            }
        } else if (course) {
            detailPanelTitle.textContent = course.courseString || 'Course Details';
            if (detailPanelSubtitle) {
                detailPanelSubtitle.textContent = course.title || 'View schedule, instructors, and section info.';
            }
        } else {
            detailPanelTitle.textContent = 'Course Details';
            if (detailPanelSubtitle) {
                detailPanelSubtitle.textContent = 'Select a course to view full information';
            }
        }
    }
    if (detailPanelBackButton) {
        const showBack = mode === 'sections';
        detailPanelBackButton.style.display = showBack ? 'inline-flex' : 'none';
        detailPanelBackButton.setAttribute('aria-hidden', showBack ? 'false' : 'true');
        detailPanelBackButton.tabIndex = showBack ? 0 : -1;
    }
}

function showCourseDetail(courseIndex) {
    const panel = ensureDetailPanel();
    if (!panel) return;
    if (courseIndex == null || !scheduledCourses[courseIndex]) {
        return;
    }
    detailPanelCourseIndex = courseIndex;
    updateDetailPanelHeader('details', scheduledCourses[courseIndex]);
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    clearSectionPreview();
    renderDetailPanelContent(scheduledCourses[courseIndex], courseIndex);
}

function renderDetailPanelContent(course, courseIndex) {
    ensureDetailPanel();
    if (!detailPanelBody) return;
    const defaultMeeting = course?.selectedSection?.meetingTimes?.[0] || null;
    const content = createCoursePopup(course, defaultMeeting, { forPanel: true, courseIndex });
    detailPanelBody.innerHTML = '';
    detailPanelBody.appendChild(content);
    if (detailPanelEmptyState) {
        detailPanelEmptyState.style.display = 'none';
    }
}

async function showSectionSelector(courseIndex) {
    const panel = ensureDetailPanel();
    if (!panel) return;
    const course = scheduledCourses[courseIndex];
    if (!course) return;
    detailPanelCourseIndex = courseIndex;
    updateDetailPanelHeader('sections', course);
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    clearSectionPreview();
    if (detailPanelEmptyState) {
        detailPanelEmptyState.style.display = 'none';
    }
    if (detailPanelBody) {
        detailPanelBody.innerHTML = `<div class="detail-panel-loading">Loading sections...</div>`;
    }

    const sections = await fetchCourseSections(course);
    if (!detailPanelBody) return;

    if (!sections.length) {
        detailPanelBody.innerHTML = `<div class="section-list-empty">No alternative sections found for this course.</div>`;
        return;
    }

    const currentIndex = course.selectedSection?.index ? String(course.selectedSection.index) : null;
    detailPanelBody.innerHTML = `
        <div class="section-list">
            ${sections.map(section => {
                const sectionIndex = String(section.index);
                const isCurrent = currentIndex === sectionIndex;
                const mt = section.meeting_times && section.meeting_times[0] ? section.meeting_times[0] : {};
                const dayText = mt.day || 'TBA';
                const startText = mt.start_time?.formatted || 'TBA';
                const endText = mt.end_time?.formatted || 'TBA';
                const location = `${mt.building || 'TBA'} ${mt.room || ''}`.trim();
                const statusClass = (section.status || '').toLowerCase() === 'open' ? 'open' : 'closed';
                return `
                    <button type="button" class="section-option${isCurrent ? ' active' : ''}" data-index="${sectionIndex}">
                        <div class="section-top">
                            <span class="section-code">Section ${section.number}</span>
                            <span class="section-index">Index ${sectionIndex}</span>
                            <span class="status-pill ${statusClass}">${section.status || ''}</span>
                        </div>
                        <div class="section-times">${dayText} • ${startText} - ${endText}</div>
                        <div class="section-meta">${location || 'Location TBA'}</div>
                    </button>
                `;
            }).join('')}
        </div>
    `;

    const sectionButtons = detailPanelBody.querySelectorAll('.section-option');
    sectionButtons.forEach(btn => {
        const idx = btn.getAttribute('data-index');
        const section = sections.find(sec => String(sec.index) === idx);
        if (!section) return;

        const triggerPreview = () => {
            if (previewDebounceTimer) {
                clearTimeout(previewDebounceTimer);
            }
            previewDebounceTimer = setTimeout(() => {
                previewSectionOnCalendar(course, section);
            }, 60);
        };

        btn.addEventListener('mouseenter', triggerPreview);
        btn.addEventListener('focus', triggerPreview);

        const clearPreview = () => {
            if (previewDebounceTimer) {
                clearTimeout(previewDebounceTimer);
                previewDebounceTimer = null;
            }
            clearSectionPreview();
        };

        btn.addEventListener('mouseleave', clearPreview);
        btn.addEventListener('blur', clearPreview);

        const selectSection = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            applySectionSelection(courseIndex, section);
            showCourseDetail(courseIndex);
        };

        btn.addEventListener('click', selectSection);
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                selectSection(e);
            }
        });
    });
}

function closeDetailPanel() {
    const panel = ensureDetailPanel();
    if (!panel) return;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    detailPanelCourseIndex = null;
    updateDetailPanelHeader('details', null);
    if (detailPanelBody) {
        detailPanelBody.innerHTML = '';
    }
    if (detailPanelEmptyState) {
        detailPanelEmptyState.style.display = 'block';
    }
    clearSectionPreview();
}

function refreshDetailPanel() {
    if (!detailPanel) {
        return;
    }
    if (!detailPanel.classList.contains('is-open')) {
        return;
    }
    if (detailPanelCourseIndex == null || !scheduledCourses[detailPanelCourseIndex]) {
        closeDetailPanel();
        return;
    }
    if (detailPanelMode === 'sections') {
        showSectionSelector(detailPanelCourseIndex);
    } else {
        const course = scheduledCourses[detailPanelCourseIndex];
        updateDetailPanelHeader('details', course);
        renderDetailPanelContent(course, detailPanelCourseIndex);
    }
}

// ============ Section Switching (Data + UI) ============
// Cache for fetched sections per courseString
const courseStringToSectionsCache = new Map();
let ghostBlocks = [];
let previewDebounceTimer = null;

async function fetchCourseSections(course) {
    const key = course.courseString;
    if (!key) return [];
    if (courseStringToSectionsCache.has(key)) {
        return courseStringToSectionsCache.get(key);
    }
    try {
        const params = new URLSearchParams({
            year: new URLSearchParams(window.location.search).get('year') || '2026',
            term: new URLSearchParams(window.location.search).get('term') || '1',
            campus: new URLSearchParams(window.location.search).get('campus') || 'NB',
            search: key
        });
        const resp = await fetch(`/api/courses?${params.toString()}`);
        const json = await resp.json();
        if (json.status !== 'success' || !Array.isArray(json.data)) {
            throw new Error('Invalid response');
        }
        // Find matching course by courseString
        const match = json.data.find(c => c.courseString === key) || json.data[0];
        const sections = (match && Array.isArray(match.sections)) ? match.sections : [];
        courseStringToSectionsCache.set(key, sections);
        return sections;
    } catch (e) {
        showNotification('Failed to load sections. Please try again.', 'danger');
        return [];
    }
}

function clearSectionPreview() {
    if (previewDebounceTimer) {
        clearTimeout(previewDebounceTimer);
        previewDebounceTimer = null;
    }
    ghostBlocks.forEach(el => el.remove());
    ghostBlocks = [];
}

function previewSectionOnCalendar(course, section) {
    clearSectionPreview();
    if (!section || !Array.isArray(section.meeting_times)) return;

    // Ensure calendar view is visible so previews render
    const calendarView = document.getElementById('calendarView');
    if (calendarView && calendarView.style.display === 'none') {
        switchView('calendar');
    }
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid || calendarGrid.children.length === 0) {
        generateCalendarGrid();
    }

    // Measure for positioning
    const firstRow = document.querySelector('.calendar-row');
    if (!firstRow) return;
    const GRID_START_HOUR = 7;
    const ROW_HEIGHT_PX = firstRow.offsetHeight || 45;
    const PX_PER_MIN = ROW_HEIGHT_PX / 60;
    const dayMap = { 'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4 };

    function parseTimeToMinutesSimple(timeStr) {
        if (!timeStr) return null;
        const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!m) return null;
        let h = parseInt(m[1], 10);
        const mins = parseInt(m[2], 10);
        const p = m[3].toUpperCase();
        if (p === 'PM' && h !== 12) h += 12;
        if (p === 'AM' && h === 12) h = 0;
        return h * 60 + mins;
    }

    section.meeting_times.forEach(mt => {
        const dIndex = dayMap[mt.day];
        if (dIndex === undefined) return;
        const start = parseTimeToMinutesSimple(mt.start_time?.formatted);
        const end = parseTimeToMinutesSimple(mt.end_time?.formatted) || (start !== null ? start + 60 : null);
        if (start === null || end === null) return;

        const dayOverlay = document.querySelector(`.day-overlay[data-day="${dIndex}"]`);
        if (!dayOverlay) return;

        const top = (start - GRID_START_HOUR * 60) * PX_PER_MIN;
        const height = Math.max((end - start) * PX_PER_MIN, 18);

        const ghost = document.createElement('div');
        ghost.className = 'ghost-course-block';
        ghost.style.top = `${top}px`;
        ghost.style.height = `${height}px`;
        ghost.innerHTML = `
            <div class="course-title">${course.courseString} (Sec ${section.number})</div>
            <div class="course-time">${mt.start_time?.formatted || 'TBA'} - ${mt.end_time?.formatted || 'TBA'}</div>
            <div class="course-location">${mt.building || 'TBA'}</div>
        `;
        dayOverlay.appendChild(ghost);
        ghostBlocks.push(ghost);
    });
}

function applySectionSelection(courseIndex, section) {
    const course = scheduledCourses[courseIndex];
    if (!course) return;
    
    // Ensure planner stays open
    if (!isPlannerOpen) {
        openPlanner();
    }
    
    course.selectedSection = {
        number: section.number,
        index: String(section.index),
        status: section.status,
        instructors: section.instructors && section.instructors.length ? section.instructors : ['TBA'],
        meetingTimes: (section.meeting_times || []).map(mt => ({
            day: mt.day,
            startTime: { formatted: mt.start_time?.formatted || 'TBA' },
            endTime: { formatted: mt.end_time?.formatted || 'TBA' },
            building: mt.building || '',
            campus: mt.campus || ''
        }))
    };
    localStorage.setItem('scheduledCourses', JSON.stringify(scheduledCourses));
    
    // Switch to details mode before updating UI to prevent refreshDetailPanel from re-opening section selector
    detailPanelMode = 'details';
    updateDetailPanelHeader('details', course);
    
    updatePlannerUI();
    showCourseDetail(courseIndex);
    showNotification(`Switched to section ${section.number} (Index ${section.index})`, 'success');
    clearSectionPreview();
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
                <h5 class="course-detail-trigger" data-course-index="${index}">${course.courseString} - ${course.title}</h5>
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
                            <button class="badge bg-primary section-switcher-btn" type="button" data-course-index="${index}">Section ${course.selectedSection.number}</button>
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

    // Wire section switcher buttons
    coursesList.querySelectorAll('.section-switcher-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const courseIndex = parseInt(btn.getAttribute('data-course-index'), 10);
            if (!Number.isNaN(courseIndex)) {
                showSectionSelector(courseIndex);
            }
        });
    });

    // Wire course title click to open detail panel
    coursesList.querySelectorAll('.course-detail-trigger').forEach(titleEl => {
        titleEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const idx = parseInt(titleEl.getAttribute('data-course-index'), 10);
            if (!Number.isNaN(idx)) {
                showCourseDetail(idx);
            }
        });
    });
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
