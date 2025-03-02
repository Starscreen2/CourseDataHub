document.addEventListener('DOMContentLoaded', function() {
    const campusMap = {
        "1": "College Ave",
        "2": "Busch",
        "3": "Livingston", 
        "4": "Cook/Doug"
    };

    // Helper function to format meeting times
    function formatMeetingTimes(meetingTimes) {
        return meetingTimes.map(meeting => `
            ${meeting.day}: ${meeting.start_time.formatted} - ${meeting.end_time.formatted}
            <br>Location: ${meeting.building} ${meeting.room}
            <br>Campus: ${meeting.campus}
            <br>Mode: ${meeting.mode}
        `).join('<br><br>');
    }

    // Helper function to format core requirements
    function formatCoreRequirements(requirements) {
        if (!requirements || requirements.length === 0) return 'None';
        return requirements.map(req => 
            `${req.code}: ${req.description}`
        ).join('<br>');
    }

    // Course search functionality
    const searchForm = document.getElementById('searchForm');
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');

    searchForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const searchTerm = searchInput.value.trim();

        if (searchTerm) {
            searchResults.innerHTML = '<div class="text-center">Searching...</div>';

            const year = document.getElementById('year').value;
            const term = document.getElementById('term').value;
            const campus = document.getElementById('campus').value;
            
            fetch(`/api/courses?year=${year}&term=${term}&campus=${campus}&search=${encodeURIComponent(searchTerm)}`)
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success' && data.data.length > 0) {
                        const resultsHtml = data.data.map((course, courseIndex) => `
                            <div class="search-result-item card mb-4">
                                <div class="card-header">
                                    <h4 class="mb-0">${course.courseString} - ${course.title}</h4>
                                </div>
                                <div class="card-body">
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <p><strong>Subject:</strong> ${course.subject} - ${course.subjectDescription}</p>
                                            <p><strong>Credits:</strong> ${course.credits} (${course.creditsDescription})</p>
                                            <p><strong>School:</strong> ${course.school}</p>
                                        </div>
                                        <div class="col-md-6">
                                            <p><strong>Campus Locations:</strong> ${course.campusLocations.join(', ')}</p>
                                            <p><strong>Prerequisites:</strong> ${course.prerequisites || 'None'}</p>
                                        </div>
                                    </div>

                                    <div class="mb-3">
                                        <h5>Core Requirements:</h5>
                                        <p>${formatCoreRequirements(course.coreRequirements)}</p>
                                    </div>

                                    <div class="sections">
                                        <button class="btn btn-primary mb-3" type="button" 
                                                data-bs-toggle="collapse" 
                                                data-bs-target="#sections-${courseIndex}" 
                                                aria-expanded="false" 
                                                aria-controls="sections-${courseIndex}">
                                            Show/Hide ${course.sections.length} Sections
                                        </button>
                                        <div class="collapse" id="sections-${courseIndex}">
                                            ${course.sections.map(section => `
                                                <div class="section-item card mb-3">
                                                    <div class="card-body">
                                                        <h6>Section ${section.number} (Index: ${section.index})</h6>
                                                        <p><strong>Instructors:</strong> 
                                                            ${section.instructors.map(instructor => `
                                                                <span class="instructor-name" data-instructor="${instructor}">
                                                                    ${instructor}
                                                                    <div class="instructor-hover-card">
                                                                        <div class="instructor-loading">Loading...</div>
                                                                        <div class="instructor-data" style="display:none;">
                                                                            <div class="instructor-field"><strong>Name:</strong> <span class="instructor-full-name"></span></div>
                                                                            <div class="instructor-field"><strong>Campus:</strong> <span class="instructor-campus"></span></div>
                                                                            <div class="instructor-field"><strong>Department:</strong> <span class="instructor-department"></span></div>
                                                                            <div class="instructor-field"><strong>Title:</strong> <span class="instructor-title"></span></div>
                                                                            <div class="instructor-field"><strong>Hire Date:</strong> <span class="instructor-hire-date"></span></div>
                                                                            <div class="instructor-field"><strong>Base Pay:</strong> <span class="instructor-base-pay"></span></div>
                                                                            <div class="instructor-field"><strong>Gross Pay:</strong> <span class="instructor-gross-pay"></span></div>
                                                                        </div>
                                                                        <div class="instructor-error" style="display:none;">Information not available</div>
                                                                    </div>
                                                                </span>
                                                            `).join(', ') || 'TBA'}
                                                        </p>
                                                        <p><strong>Status:</strong> ${section.status}</p>
                                                        ${section.comments ? `<p><strong>Comments:</strong> ${section.comments}</p>` : ''}
                                                        <div class="meeting-times">
                                                            <strong>Meeting Times:</strong><br>
                                                            ${formatMeetingTimes(section.meeting_times)}
                                                        </div>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `).join('');

                        searchResults.innerHTML = resultsHtml;
                    } else {
                        searchResults.innerHTML = '<div class="alert alert-info">No courses found</div>';
                    }
                })
                .catch(error => {
                    console.error('Error searching courses:', error);
                    searchResults.innerHTML = '<div class="alert alert-danger">Error searching courses</div>';
                });
        }
    });

    // Check API health status
    function updateStatus() {
        fetch('/api/health')
            .then(response => response.json())
            .then(data => {
                const statusText = document.getElementById('statusText');
                const date = new Date(data.last_update);
                const formattedDate = date.toLocaleString();

                if (data.status === 'healthy') {
                    statusText.innerHTML = `
                        <span class="status-healthy">●</span> API is healthy<br>
                        Last updated: ${formattedDate}
                    `;
                } else {
                    statusText.innerHTML = `
                        <span class="status-error">●</span> API is experiencing issues
                    `;
                }
            })
            .catch(error => {
                const statusText = document.getElementById('statusText');
                statusText.innerHTML = `
                    <span class="status-error">●</span> Unable to connect to API
                `;
                console.error('Error fetching API status:', error);
            });
    }

    // Update status every 30 seconds
    updateStatus();
    setInterval(updateStatus, 30000);
    
    // Event delegation for instructor hover cards
    document.addEventListener('click', function(e) {
        // Close all hover cards when clicking elsewhere
        if (!e.target.closest('.instructor-name')) {
            document.querySelectorAll('.instructor-hover-card').forEach(card => {
                card.classList.remove('active');
            });
        }
    });
    
    // Add event listener for instructor hover functionality using event delegation
    document.addEventListener('mouseover', function(e) {
        const instructorElement = e.target.closest('.instructor-name');
        if (instructorElement) {
            const hoverCard = instructorElement.querySelector('.instructor-hover-card');
            if (hoverCard) {
                // Position the hover card
                const rect = instructorElement.getBoundingClientRect();
                hoverCard.style.top = '100%';
                hoverCard.style.left = '0';
                
                // Show the hover card
                hoverCard.classList.add('active');
                
                // Get instructor name
                const instructorName = instructorElement.getAttribute('data-instructor');
                
                // Check if we need to load data
                const loadingElement = hoverCard.querySelector('.instructor-loading');
                const dataElement = hoverCard.querySelector('.instructor-data');
                const errorElement = hoverCard.querySelector('.instructor-error');
                
                if (loadingElement.style.display !== 'none') {
                    // Show loading, hide others
                    loadingElement.style.display = 'block';
                    dataElement.style.display = 'none';
                    errorElement.style.display = 'none';
                    
                    // Fetch instructor data
                    fetch(`/api/instructor/${encodeURIComponent(instructorName)}`)
                        .then(response => response.json())
                        .then(data => {
                            // Hide loading
                            loadingElement.style.display = 'none';
                            
                            if (data.status === 'success') {
                                // Fill in the data
                                dataElement.querySelector('.instructor-full-name').textContent = data.data.name || 'N/A';
                                dataElement.querySelector('.instructor-campus').textContent = data.data.campus || 'N/A';
                                dataElement.querySelector('.instructor-department').textContent = data.data.department || 'N/A';
                                dataElement.querySelector('.instructor-title').textContent = data.data.title || 'N/A';
                                dataElement.querySelector('.instructor-hire-date').textContent = data.data.hire_date || 'N/A';
                                dataElement.querySelector('.instructor-base-pay').textContent = data.data.base_pay || 'N/A';
                                dataElement.querySelector('.instructor-gross-pay').textContent = data.data.gross_pay || 'N/A';
                                
                                // Show data, hide error
                                dataElement.style.display = 'block';
                                errorElement.style.display = 'none';
                            } else {
                                // Show error, hide data
                                dataElement.style.display = 'none';
                                errorElement.style.display = 'block';
                            }
                        })
                        .catch(error => {
                            console.error('Error fetching instructor data:', error);
                            // Hide loading, show error
                            loadingElement.style.display = 'none';
                            dataElement.style.display = 'none';
                            errorElement.style.display = 'block';
                        });
                }
            }
        }
    });
    
    // Add event listener for mouse leaving instructor element to close hover card after a delay
    document.addEventListener('mouseout', function(e) {
        const instructorElement = e.target.closest('.instructor-name');
        if (instructorElement) {
            const hoverCard = instructorElement.querySelector('.instructor-hover-card');
            if (hoverCard && !hoverCard.contains(e.relatedTarget) && !instructorElement.contains(e.relatedTarget)) {
                // Add a small delay before hiding to allow for moving to the hover card
                setTimeout(() => {
                    if (!hoverCard.contains(document.activeElement)) {
                        hoverCard.classList.remove('active');
                    }
                }, 300);
            }
        }
    });
});