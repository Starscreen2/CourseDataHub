// Function to copy text to clipboard
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

async function copyToClipboard(text, button = document.activeElement) {
    try {
        if (!navigator.clipboard?.writeText) {
            throw new Error('Clipboard access is unavailable in this browser context.');
        }
        await navigator.clipboard.writeText(String(text ?? ''));
        // Show success feedback
        const activeButton = button;
        if (activeButton && activeButton.classList.contains('copy-button')) {
            const originalHTML = activeButton.innerHTML;
            activeButton.innerHTML = '<i class="bi bi-check"></i>';
            activeButton.classList.add('copy-success');
            
            setTimeout(() => {
                activeButton.innerHTML = originalHTML;
                activeButton.classList.remove('copy-success');
            }, 1500);
        }
    } catch (err) {
        console.error('Failed to copy text: ', err);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    // Initialize Bootstrap tooltips with HTML enabled
    function initializeTooltips() {
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        tooltipTriggerList.forEach(tooltipEl => {
            new bootstrap.Tooltip(tooltipEl, {
                html: true  // ✅ Enables rendering of HTML inside tooltips
            });
        });
    }

    async function fetchSalaryData(instructorName, tooltipElement) {
        if (tooltipElement.dataset.salaryLoaded === 'true' || tooltipElement.dataset.salaryLoading === 'true') return;
        tooltipElement.dataset.salaryLoading = 'true';
        let resultResolved = false;
        try {
            // Convert "LAST, FIRST" to "First Last"
            let nameParts = instructorName.split(", ");
            let formattedName = nameParts.length === 2 ? `${nameParts[1]} ${nameParts[0]}` : instructorName;

            console.log("🔍 Fetching salary for:", formattedName); // Debugging

            const response = await fetch(`/api/salary?name=${encodeURIComponent(formattedName)}`);
            if (!response.ok && response.status !== 404) {
                throw new Error(`Salary lookup failed (${response.status}).`);
            }
            const data = response.status === 404 ? { error: 'No salary data found' } : await response.json();
            if (!data || typeof data !== 'object') {
                throw new Error('Salary lookup returned an invalid response.');
            }
            resultResolved = true;
            console.log("📡 API Response:", data); // Debugging

            let tooltipInstance = bootstrap.Tooltip.getInstance(tooltipElement);
            if (!tooltipInstance) return;

            // ✅ Format tooltip content with proper layout while using setContent method
            if (data.error || !data.name) {
                tooltipInstance.setContent({ '.tooltip-inner': "No salary data found" });
            } else {
                tooltipInstance.setContent({
                    '.tooltip-inner': `
                        <div style="text-align: left; max-width: 280px;">
                            <em>Special thanks to Github: ibrahimmudassar for the data</em><br><br>
                            <em>As of December, 2021</em><br><br>
                            <strong>${escapeHTML(data.name)}</strong><br><br>
                            <strong>Title:</strong> ${escapeHTML(data.title)}<br>
                            <strong>Department:</strong> ${escapeHTML(data.department)}<br>
                            <strong>Campus:</strong> ${escapeHTML(data.campus)}<br>
                            <strong>Base Pay:</strong> ${escapeHTML(data.base_pay)}<br>
                            <strong>Gross Pay:</strong> ${escapeHTML(data.gross_pay)}<br>
                            <strong>Hire Date:</strong> ${escapeHTML(data.hire_date)}
                        </div>
                    `
                });
            }

            console.log("✅ Tooltip updated successfully"); // Debugging
        } catch (error) {
            console.error("❌ Error fetching salary data:", error);

            let tooltipInstance = bootstrap.Tooltip.getInstance(tooltipElement);
            if (tooltipInstance) {
                tooltipInstance.setContent({ '.tooltip-inner': "Error loading salary data" });
            }
        } finally {
            tooltipElement.dataset.salaryLoading = 'false';
            // Cache found/missing results, but let transient failures retry on hover.
            tooltipElement.dataset.salaryLoaded = String(resultResolved);
        }
    }

    // ✅ Add single event listener for instructor hover (fixes duplicate event issue)
    document.body.addEventListener("mouseover", function (event) {
        const tooltipElement = event.target.closest?.('.instructor-name');
        if (tooltipElement) {
            let instructorName = tooltipElement.textContent.trim();

            fetchSalaryData(instructorName, tooltipElement);
        }
    });

    // ✅ Ensure tooltips initialize correctly after dynamic content loads
    initializeTooltips();

    // ================================
    // Course Search Functionality
    // ================================
    const searchForm = document.getElementById('searchForm');
    const searchInput = document.getElementById('search');
    const searchResults = document.getElementById('results');
    const peopleDropdownMenu = document.getElementById('peopleDropdownMenu');

    function normalizeInstructorName(name) {
        const trimmed = (name || '').trim();
        if (!trimmed) return '';
        if (trimmed.includes(',')) {
            const parts = trimmed.split(',');
            if (parts.length >= 2) {
                const last = parts[0].trim();
                const first = parts[1].trim();
                return `${first} ${last}`;
            }
        }
        return trimmed;
    }

    function buildInstructorIndex(courses) {
        const map = new Map(); // key: displayName, value: Set of courseStrings
        courses.forEach(course => {
            const code = course.courseString;
            (course.sections || []).forEach(section => {
                (section.instructors || []).forEach(instr => {
                    const display = normalizeInstructorName(instr);
                    if (!display) return;
                    if (!map.has(display)) map.set(display, new Set());
                    map.get(display).add(code);
                });
            });
        });
        // Convert to sorted array of {name, codes}
        return Array.from(map.entries())
            .map(([name, setCodes]) => ({ name, codes: Array.from(setCodes).sort() }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    function renderPeopleDropdown(courses) {
        if (!peopleDropdownMenu) return;
        const index = buildInstructorIndex(courses);
        if (index.length === 0) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'dropdown-item text-muted';
            emptyItem.textContent = 'No instructors found';
            peopleDropdownMenu.replaceChildren(emptyItem);
            return;
        }
        const fragment = document.createDocumentFragment();
        index.forEach(item => {
            const listItem = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'dropdown-item instructor-option';
            link.dataset.name = item.name;
            link.append(document.createTextNode(item.name + ' '));
            const codes = document.createElement('span');
            codes.className = 'text-muted';
            codes.textContent = `(${item.codes.join(', ')})`;
            link.appendChild(codes);
            listItem.appendChild(link);
            fragment.appendChild(listItem);
        });
        peopleDropdownMenu.replaceChildren(fragment);
    }

    let courseSearchRequestId = 0;
    const loadingSpinner = document.getElementById('loadingSpinner');

    // Handle nested clicks in instructor menus and section copy buttons.
    document.body.addEventListener('click', function(e) {
        const instructorOption = e.target.closest?.('.instructor-option');
        if (instructorOption) {
            e.preventDefault();
            const name = instructorOption.getAttribute('data-name');
            if (name) {
                searchInput.value = name;
                searchForm.requestSubmit();
            }
        }

        const copyButton = e.target.closest?.('.copy-button');
        if (copyButton) {
            e.preventDefault();
            copyToClipboard(copyButton.dataset.copyIndex || '', copyButton);
        }
    });

    searchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const requestId = ++courseSearchRequestId;
        const searchTerm = searchInput.value.trim();
        if (!searchTerm) {
            if (loadingSpinner) loadingSpinner.style.display = 'none';
            searchResults.innerHTML = '<div class="alert alert-info">Enter a course, instructor, or keyword to search.</div>';
            window.courseSearchData = [];
            renderPeopleDropdown([]);
            return;
        }
        
        // Get current URL parameters to maintain consistent year/term/campus values
        const urlParams = new URLSearchParams(window.location.search);
        const year = urlParams.get('year') || '2026';
        const term = urlParams.get('term') || '1';
        const campus = urlParams.get('campus') || 'NB';
        
        // Build the search query with all parameters
        const searchParams = new URLSearchParams({
            year: year,
            term: term,
            campus: campus,
            search: searchTerm
        });

        // Add status filters
        const statusOpen = document.getElementById('statusOpen');
        const statusClosed = document.getElementById('statusClosed');
        if (statusOpen && statusOpen.checked) {
            searchParams.append('status_open', 'true');
        }
        if (statusClosed && statusClosed.checked) {
            searchParams.append('status_closed', 'true');
        }

        // Add course type filters
        const typeTraditional = document.getElementById('typeTraditional');
        const typeHybrid = document.getElementById('typeHybrid');
        const typeOnline = document.getElementById('typeOnline');
        if (typeTraditional && typeTraditional.checked) {
            searchParams.append('type_traditional', 'true');
        }
        if (typeHybrid && typeHybrid.checked) {
            searchParams.append('type_hybrid', 'true');
        }
        if (typeOnline && typeOnline.checked) {
            searchParams.append('type_online', 'true');
        }

        // Add campus filters
        const campusCollegeAve = document.getElementById('campusCollegeAve');
        const campusBusch = document.getElementById('campusBusch');
        const campusLivingston = document.getElementById('campusLivingston');
        const campusCookDoug = document.getElementById('campusCookDoug');
        const campusOnline = document.getElementById('campusOnline');
        if (campusCollegeAve && campusCollegeAve.checked) {
            searchParams.append('campus_college_ave', 'true');
        }
        if (campusBusch && campusBusch.checked) {
            searchParams.append('campus_busch', 'true');
        }
        if (campusLivingston && campusLivingston.checked) {
            searchParams.append('campus_livingston', 'true');
        }
        if (campusCookDoug && campusCookDoug.checked) {
            searchParams.append('campus_cook_doug', 'true');
        }
        if (campusOnline && campusOnline.checked) {
            searchParams.append('campus_online', 'true');
        }

        // Add school filter
        const schoolFilter = document.getElementById('schoolFilter');
        if (schoolFilter && schoolFilter.value) {
            searchParams.append('school', schoolFilter.value);
        }

        // Add core code filter
        const coreCodeFilter = document.getElementById('coreCodeFilter');
        if (coreCodeFilter && coreCodeFilter.value) {
            searchParams.append('core_code', coreCodeFilter.value);
        }

        // Add subject filter
        const subjectFilter = document.getElementById('subjectFilter');
        if (subjectFilter && subjectFilter.value) {
            searchParams.append('subject', subjectFilter.value);
        }

        if (loadingSpinner) loadingSpinner.style.display = 'block';
        searchResults.innerHTML = '<div class="text-center">Searching...</div>';

        fetch(`/api/courses?${searchParams.toString()}`)
                .then(response => {
                    if (!response.ok) throw new Error(`Course search failed (${response.status}).`);
                    return response.json();
                })
                .then(data => {
                    if (requestId !== courseSearchRequestId) return;
                    if (data.status !== 'success' || !Array.isArray(data.data)) {
                        throw new Error(data.message || 'Course search returned an invalid response.');
                    }
                    window.courseSearchData = data.data;
                    renderPeopleDropdown(data.data);
                    if (data.data.length > 0) {
                        const resultsHtml = data.data.map((course, courseIndex) => {
                            // Extract all unique instructors for this course
                            const courseInstructors = new Set();
                            (course.sections || []).forEach(section => {
                                (section.instructors || []).forEach(instructor => {
                                    const normalized = normalizeInstructorName(instructor);
                                    if (normalized) courseInstructors.add(normalized);
                                });
                            });
                            const instructorsList = Array.from(courseInstructors).sort();
                            
                            return `
                            <div class="search-result-item card mb-4">
                                <div class="card-header d-flex justify-content-between align-items-center">
                                    <h4 class="mb-0">${escapeHTML(course.courseString)} - ${escapeHTML(course.title)}</h4>
                                    ${instructorsList.length > 0 ? `
                                        <div class="dropdown">
                                            <button class="btn btn-outline-secondary btn-sm dropdown-toggle" type="button" 
                                                    id="instructorsDropdown${courseIndex}" data-bs-toggle="dropdown" 
                                                    aria-expanded="false">
                                                Instructors (${instructorsList.length})
                                            </button>
                                            <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="instructorsDropdown${courseIndex}">
                                                ${instructorsList.map(instructor => `
                                                    <li><a class="dropdown-item instructor-option" href="#" data-name="${escapeHTML(instructor)}">${escapeHTML(instructor)}</a></li>
                                                `).join('')}
                                            </ul>
                                        </div>
                                    ` : ''}
                                </div>
                                <div class="card-body">
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <p><strong>Subject:</strong> ${escapeHTML(course.subject)} - ${escapeHTML(course.subjectDescription)}</p>
                                            <p><strong>Credits:</strong> ${escapeHTML(course.creditsDescription || course.credits)}</p>
                                            <p><strong>School:</strong> ${escapeHTML(course.school || 'N/A')}</p>
                                        </div>
                                        <div class="col-md-6">
                                            <p><strong>Campus Locations:</strong> ${escapeHTML(Array.isArray(course.campusLocations) ? course.campusLocations.join(', ') : 'N/A')}</p>
                                            <p><strong>Prerequisites:</strong> ${escapeHTML(course.prerequisites || 'None')}</p>
                                            <p><strong>Core Codes:</strong> ${Array.isArray(course.coreRequirements) && course.coreRequirements.length > 0 ? 
                                                course.coreRequirements.map(core => `${escapeHTML(core.code)} (${escapeHTML(core.description)})`).join(', ') : 'N/A'}</p>
                                        </div>
                                    </div>

                                    <div class="sections">
                                        <button class="btn btn-primary mb-3" type="button" 
                                                data-bs-toggle="collapse" 
                                                data-bs-target="#sections-${courseIndex}" 
                                                aria-expanded="false" 
                                                aria-controls="sections-${courseIndex}">
                                            Show/Hide ${(course.sections || []).length} Sections
                                        </button>
                                        <div class="collapse" id="sections-${courseIndex}">
                                            ${(course.sections || []).map(section => `
                                                <div class="section-item card mb-3" data-course-index="${courseIndex}" data-section-index="${escapeHTML(section.index)}">
                                                    <div class="card-body">
                                                        <h6>Section ${escapeHTML(section.number)} (Index: ${escapeHTML(section.index)} <button type="button" class="copy-button btn btn-sm btn-link p-0" data-copy-index="${escapeHTML(section.index)}" aria-label="Copy section index" title="Copy section index"><i class="bi bi-clipboard"></i></button>)</h6>
                                                        <p><strong>Instructors:</strong> 
                                                            ${(section.instructors || []).map(instructor =>
                                                                `<span class="instructor-name" data-bs-toggle="tooltip" data-bs-placement="top" 
                                                                title="Loading salary data...">
                                                                ${escapeHTML(String(instructor).trim())}</span>`
                                                            ).join(', ') || 'TBA'}
                                                        </p>
                                                        <p><strong>Status:</strong> <span class="${String(section.status || '').toLowerCase() === 'open' ? 'status-open' : 'status-closed'}">${escapeHTML(section.status || 'Unknown')}</span></p>
                                                        <div class="meeting-times">
                                                            <strong>Meeting Times:</strong><br>
                                                            ${(section.meeting_times || []).map(time => `
                                                                <p>
                                                                    ${escapeHTML(time.day || 'TBA')}
                                                                    ${escapeHTML(time.start_time?.formatted || 'TBA')} - ${escapeHTML(time.end_time?.formatted || 'TBA')}<br>
                                                                    Location: ${escapeHTML(time.building)} ${escapeHTML(time.room)}<br>
                                                                    Campus: ${escapeHTML(time.campus)}<br>
                                                                    Mode: ${escapeHTML(time.mode)}
                                                                </p>
                                                            `).join('')}
                                                        </div>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                        }).join('');

                        searchResults.innerHTML = resultsHtml;
                        initializeTooltips();
                    } else {
                        searchResults.innerHTML = '<div class="alert alert-info">No courses found</div>';
                    }
                })
                .catch(error => {
                    if (requestId !== courseSearchRequestId) return;
                    console.error('Error searching courses:', error);
                    window.courseSearchData = [];
                    renderPeopleDropdown([]);
                    searchResults.innerHTML = `<div class="alert alert-danger">${escapeHTML(error.message || 'Error searching courses')}</div>`;
                })
                .finally(() => {
                    if (requestId === courseSearchRequestId && loadingSpinner) loadingSpinner.style.display = 'none';
                });
    });

    // ================================
    // API Health Status Checker
    // ================================
    function updateStatus() {
        const statusText = document.getElementById('statusText');
        if (!statusText) return;

        fetch('/api/health')
            .then(response => response.json())
            .then(data => {
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
                statusText.innerHTML = `
                    <span class="status-error">●</span> Unable to connect to API
                `;
                console.error('Error fetching API status:', error);
            });
    }

    if (document.getElementById('statusText')) {
        updateStatus();
        setInterval(updateStatus, 30000);
    }
});
