
document.addEventListener("DOMContentLoaded", function () {
    const menuToggle = document.getElementById("menu-toggle");
    const navLinks = document.getElementById("nav-links");


    menuToggle.addEventListener("click", function () {
        const isOpen = navLinks.classList.toggle("open");

        menuToggle.setAttribute("aria-expanded", isOpen);
        menuToggle.setAttribute(
            "aria-label",
            isOpen ? "Close navigation menu" : "Open navigation menu"
        );

        menuToggle.textContent = isOpen ? "×" : "☰";
    });


    navLinks.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
            navLinks.classList.remove("open");
            menuToggle.setAttribute("aria-expanded", "false");
            menuToggle.setAttribute("aria-label", "Open navigation menu");
            menuToggle.textContent = "☰";
        });
    });

    console.log("JobGuard home page loaded successfully.");
});


document.addEventListener("DOMContentLoaded", function () {
    const jobCheckForm = document.getElementById("job-check-form");
    const formMessage = document.getElementById("form-message");
    const viewResultsButton =
        document.getElementById("view-results-button");

    if (!jobCheckForm) return;

    jobCheckForm.addEventListener("submit", function (event) {
        event.preventDefault();
        console.log("JOBGUARD FORM HANDLER IS RUNNING");

        const companyName =
            document.getElementById("company-name").value.trim();

        const jobTitle =
            document.getElementById("job-title").value.trim();

        const jobDescription =
            document.getElementById("job-description").value.trim();

        const jobUrl =
            document.getElementById("job-url").value.trim();

        const contactInfo =
            document.getElementById("contact-info").value.trim();

        viewResultsButton.hidden = true;

        if (!companyName || !jobTitle || !jobDescription) {
            formMessage.textContent =
                "Please complete all required fields.";
            return;
        }

        const advertText = [
            companyName,
            jobTitle,
            jobDescription,
            jobUrl,
            contactInfo
        ].join(" ").toLowerCase();

        // Each category is scored only once.
        const findings = [];

        function addFinding(category, points, severity,
            explanation, recommendation, evidence) {

            findings.push({
                category: category,
                points: points,
                severity: severity,
                explanation: explanation,
                recommendation: recommendation,
                evidence: evidence
            });
        }

        // 1. Upfront payment requests
        const paymentPhrases = [
            "registration fee",
            "application fee",
            "processing fee",
            "pay to secure",
            "upfront payment",
            "pay a fee",
            "recruitment fee"
        ];

        const paymentMatches = paymentPhrases.filter(
            phrase => advertText.includes(phrase)
        );

        if (paymentMatches.length > 0) {
            addFinding(
                "Upfront payment requests",
                25,
                "High",
                "The advertisement contains language associated " +
                "with recruitment or upfront payments.",
                "Verify the recruiter independently. Do not pay " +
                "to secure a job without reliable verification.",
                paymentMatches
            );
        }

        // 2. Sensitive information requests
        const sensitivePhrases = [
            "bank password",
            "bank pin",
            "bank account details",
            "send your id",
            "identity card number",
            "national id number",
            "share your password"
        ];

        const sensitiveMatches = sensitivePhrases.filter(
            phrase => advertText.includes(phrase)
        );

        if (sensitiveMatches.length > 0) {
            addFinding(
                "Sensitive information requests",
                25,
                "High",
                "The advertisement may request sensitive " +
                "identity or financial information.",
                "Never share passwords, PINs or unnecessary " +
                "sensitive information. Verify the employer first.",
                sensitiveMatches
            );
        }

        // 3. Unrealistic salary promises
        const salaryPatterns = [
            /guaranteed (?:income|earnings|salary)/i,
            /earn (?:up to )?(?:ksh|kes|kes\.|ksh\.)?\s*\d[\d,]*\s*(?:per|a)\s*(?:day|hour)/i,
            /(?:ksh|kes)\s*[\d,]+\s*(?:per|a)\s*day/i,
            /(?:ksh|kes)\s*[\d,]+\s*(?:per|a)\s*week/i,
            /no experience (?:needed|required).{0,100}(?:ksh|kes)\s*[\d,]+/i
        ];

        const salaryMatches = salaryPatterns
            .filter(pattern => pattern.test(advertText))
            .map(pattern => pattern.source);

        if (salaryMatches.length > 0) {
            addFinding(
                "Unrealistic salary promises",
                15,
                "Medium",
                "The advertisement contains a salary or " +
                "earnings claim that requires verification.",
                "Compare the pay with similar jobs and confirm " +
                "the duties, working hours and employer details.",
                salaryMatches
            );
        }

        // 4. Urgency and pressure
        const urgencyPhrases = [
            "apply immediately",
            "limited slots",
            "urgent hiring",
            "act now",
            "immediate payment",
            "pay today",
            "last chance to apply",
            "apply today",
            "only 10 positions remain",
            "limited positions",
            "few positions remaining",
            "hurry up",
            "immediate action required",
            "deadline approaching"
        ];
        const urgencyMatches = urgencyPhrases.filter(
            phrase => advertText.includes(phrase)
        );
        console.log("Advertisement text:", advertText);
        console.log("Urgency matches:", urgencyMatches);

        if (urgencyMatches.length > 0) {
            addFinding(
                "Urgency and pressure",
                15,
                "Medium",
                "The advertisement uses language that may " +
                "pressure applicants to act quickly.",
                "Take time to verify the opportunity. Avoid " +
                "rushed payments or decisions.",
                urgencyMatches
            );
        }

        // 5. Suspicious URL patterns
        const shortenerDomains = [
            "bit.ly",
            "tinyurl.com",
            "t.co",
            "is.gd",
            "cutt.ly",
            "shorturl.at"
        ];

        let suspiciousUrl = false;

        try {
            if (jobUrl) {
                const parsedUrl = new URL(jobUrl);
                const hostname = parsedUrl.hostname.toLowerCase();

                suspiciousUrl =
                    shortenerDomains.some(domain =>
                        hostname === domain ||
                        hostname.endsWith("." + domain)
                    ) ||
                    parsedUrl.protocol !== "https:";
            }
        } catch (error) {
            // An invalid optional URL is handled separately.
            suspiciousUrl = false;
        }

        if (jobUrl && suspiciousUrl) {
            addFinding(
                "Suspicious contact details or URL patterns",
                10,
                "Low",
                "The supplied link uses a URL pattern that " +
                "requires additional verification.",
                "Avoid entering personal information through " +
                "unverified links. Find the employer's official " +
                "website independently.",
                ["Advertisement URL requires verification"]
            );
        }

        // 6. Incomplete advertisement details
        const missingDetails = [];

        if (companyName.length < 3) {
            missingDetails.push("Limited company name details");
        }

        if (jobTitle.length < 3) {
            missingDetails.push("Limited job title details");
        }

        if (jobDescription.length < 80) {
            missingDetails.push("Very short job description");
        }

        const descriptionLower = jobDescription.toLowerCase();

        if (
            !/\b(requirements?|qualifications?|experience|skills|duties|responsibilities)\b/i.test(
                descriptionLower
            )
        ) {
            missingDetails.push(
                "No clear requirements or duties identified"
            );
        }

        if (missingDetails.length > 0) {
            addFinding(
                "Incomplete advertisement details",
                10,
                "Low",
                "Some job information appears limited or " +
                "unclear based on the submitted details.",
                "Request clear job duties, qualifications and " +
                "verifiable employer information.",
                missingDetails
            );
        }

        // Calculate the weighted score.
        const riskScore = Math.min(
            findings.reduce(
                (total, finding) => total + finding.points,
                0
            ),
            100
        );

        let riskLevel;

        if (riskScore < 25) {
            riskLevel = "Low";
        } else if (riskScore < 50) {
            riskLevel = "Medium";
        } else {
            riskLevel = "High";
        }

        // Save the assessment for the results page.
        const assessment = {
            companyName,
            jobTitle,
            jobDescription,
            jobUrl,
            contactInfo,
            riskScore,
            riskLevel,
            findings,
            warningSigns: findings.map(
                finding => finding.category
            ),
            assessedAt: new Date().toISOString()
        };

        try {
            // Save the latest assessment for the results page.
            sessionStorage.setItem(
                "jobGuardAssessment",
                JSON.stringify(assessment)
            );

            // Retrieve previous assessments.
            let savedAssessments = JSON.parse(
                sessionStorage.getItem("jobGuardAssessments") || "[]"
            );


            savedAssessments.unshift(assessment);


            sessionStorage.setItem(
                "jobGuardAssessments",
                JSON.stringify(savedAssessments)
            );
        } catch (error) {
            formMessage.textContent =
                "We could not save the assessment. Please try again.";
            return;
        }

        formMessage.textContent =
            "Assessment complete. Your preliminary results are ready.";

        viewResultsButton.hidden = false;
    });

    viewResultsButton.addEventListener("click", function () {
        window.location.href = "/results";
    });
});

/* =====================================
   14. MY ASSESSMENTS PAGE
===================================== */

document.addEventListener("DOMContentLoaded", function () {

    const tableBody =
        document.getElementById("history-table-body");

    // Exit if this is not the My Assessments page.
    if (!tableBody) return;

    // Retrieve actual assessments saved by JobGuard.
    const sampleAssessments = JSON.parse(
        sessionStorage.getItem("jobGuardAssessments") || "[]"
    ).map(function (assessment, index) {

        return {
            id: "A" + String(index + 1).padStart(3, "0"),

            date: new Date(assessment.assessedAt)
                .toLocaleDateString("en-CA"),

            title: assessment.jobTitle,

            company: assessment.companyName,

            risk: assessment.riskLevel.toLowerCase()
        };
    });
    const searchInput =
        document.getElementById("history-search");

    const riskFilter =
        document.getElementById("risk-filter");

    const dateFilter =
        document.getElementById("date-filter");

    const statusMessage =
        document.getElementById("history-status");

    const totalCount =
        document.getElementById("total-count");

    const lowCount =
        document.getElementById("low-count");

    const mediumCount =
        document.getElementById("medium-count");

    const highCount =
        document.getElementById("high-count");

    const pageInfo =
        document.getElementById("history-page-info");

    const previousButton =
        document.getElementById("previous-page");

    const nextButton =
        document.getElementById("next-page");

    const recordsPerPage = 5;
    let currentPage = 1;

    // Update summary cards.
    function updateSummary() {

        totalCount.textContent = sampleAssessments.length;

        lowCount.textContent = sampleAssessments.filter(
            record => record.risk === "low"
        ).length;

        mediumCount.textContent = sampleAssessments.filter(
            record => record.risk === "medium"
        ).length;

        highCount.textContent = sampleAssessments.filter(
            record => record.risk === "high"
        ).length;
    }

    // Search and filter assessments.
    function getFilteredAssessments() {

        const searchTerm =
            searchInput.value.toLowerCase().trim();

        const selectedRisk = riskFilter.value;
        const selectedDate = dateFilter.value;

        // Use local calendar dates for the date filter.
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return sampleAssessments.filter(function (record) {

            const matchesSearch = [
                record.title,
                record.company,
                record.date
            ].some(function (value) {
                return value.toLowerCase().includes(searchTerm);
            });

            const matchesRisk =
                selectedRisk === "all" ||
                record.risk === selectedRisk;

            let matchesDate = true;

            if (selectedDate !== "all") {

                const recordDate = new Date(
                    record.date + "T00:00:00"
                );

                const days = Number(selectedDate);
                const startDate = new Date(today);

                startDate.setDate(
                    today.getDate() - (days - 1)
                );

                matchesDate =
                    recordDate >= startDate &&
                    recordDate <= today;
            }

            return matchesSearch &&
                matchesRisk &&
                matchesDate;
        });
    }

    // Display the records.
    function renderAssessments() {

        const filteredRecords = getFilteredAssessments();

        const totalPages = Math.max(
            1,
            Math.ceil(filteredRecords.length / recordsPerPage)
        );

        currentPage = Math.min(currentPage, totalPages);

        const startIndex =
            (currentPage - 1) * recordsPerPage;

        const visibleRecords = filteredRecords.slice(
            startIndex,
            startIndex + recordsPerPage
        );

        tableBody.replaceChildren();

        if (visibleRecords.length === 0) {

            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 5;
            cell.className = "history-empty";
            cell.textContent = "No matching assessments found.";

            row.appendChild(cell);
            tableBody.appendChild(row);

        } else {

            visibleRecords.forEach(function (record) {

                const row = document.createElement("tr");

                const dateCell = document.createElement("td");
                dateCell.textContent = record.date;

                const titleCell = document.createElement("td");
                titleCell.textContent = record.title;

                const companyCell = document.createElement("td");
                companyCell.textContent = record.company;

                const riskCell = document.createElement("td");
                const riskBadge = document.createElement("span");

                riskBadge.className =
                    "history-risk " + record.risk;

                riskBadge.textContent =
                    record.risk.charAt(0).toUpperCase() +
                    record.risk.slice(1);

                riskCell.appendChild(riskBadge);

                const actionCell = document.createElement("td");
                const viewButton = document.createElement("button");

                viewButton.type = "button";
                viewButton.className = "view-result-btn";
                viewButton.textContent = "View";

                viewButton.addEventListener("click", function () {

                    statusMessage.textContent =
                        "Demo record " + record.id +
                        ": opening individual saved results " +
                        "will be implemented in the next stage.";
                });

                actionCell.appendChild(viewButton);

                row.append(
                    dateCell,
                    titleCell,
                    companyCell,
                    riskCell,
                    actionCell
                );

                tableBody.appendChild(row);
            });
        }

        statusMessage.textContent =
            filteredRecords.length +
            " matching demonstration record(s).";

        pageInfo.textContent =
            "Page " + currentPage + " of " + totalPages;

        previousButton.disabled = currentPage === 1;
        nextButton.disabled = currentPage === totalPages;
    }

    // Reset to page 1 when filtering.
    function resetPageAndRender() {
        currentPage = 1;
        renderAssessments();
    }

    searchInput.addEventListener(
        "input",
        resetPageAndRender
    );

    riskFilter.addEventListener(
        "change",
        resetPageAndRender
    );

    dateFilter.addEventListener(
        "change",
        resetPageAndRender
    );

    previousButton.addEventListener("click", function () {

        if (currentPage > 1) {
            currentPage--;
            renderAssessments();
        }
    });

    nextButton.addEventListener("click", function () {

        const totalPages = Math.max(
            1,
            Math.ceil(
                getFilteredAssessments().length / recordsPerPage
            )
        );

        if (currentPage < totalPages) {
            currentPage++;
            renderAssessments();
        }
    });

    updateSummary();
    renderAssessments();

});



