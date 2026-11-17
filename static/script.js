
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


    jobCheckForm.addEventListener("submit", async function (event) {
        event.preventDefault();

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

        const submitButton =
            jobCheckForm.querySelector('button[type="submit"]');

        viewResultsButton.hidden = true;

        if (!companyName || !jobTitle || !jobDescription) {
            formMessage.textContent =
                "Please complete all required fields.";
            return;
        }

        submitButton.disabled = true;
        formMessage.textContent = "Assessing advertisement...";

        try {
            const response = await fetch("/assess-job", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    companyName: companyName,
                    jobTitle: jobTitle,
                    jobDescription: jobDescription,
                    jobUrl: jobUrl,
                    contactInfo: contactInfo
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || "Assessment could not be completed."
                );
            }

            formMessage.textContent =
                "Assessment complete. Your results are ready.";

            window.location.href = data.redirect_url;

        } catch (error) {
            console.error("Assessment error:", error);

            formMessage.textContent =
                error.message || "Unable to connect to the server. Please try again.";

        } finally {
            submitButton.disabled = false;
        }
    });




    /* =====================================
       14. MY ASSESSMENTS PAGE
    ===================================== */




    const tableBody =
        document.getElementById("history-table-body");

    // Exit if this is not the My Assessments page.
    if (!tableBody) return;

    // Retrieve assessment records supplied by Flask from MySQL.
    const assessments = window.jobGuardAssessments || [];


    const records = assessments.map(function (assessment) {
        return {
            id: assessment.assessment_id,
            date: assessment.assessed_at,
            title: assessment.job_title,
            company: assessment.company_name,
            risk: assessment.risk_level.toLowerCase(),
            score: assessment.risk_score
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

    // Update summary cards using database records.
    function updateSummary() {

        totalCount.textContent = records.length;

        lowCount.textContent = records.filter(
            record => record.risk === "low"
        ).length;

        mediumCount.textContent = records.filter(
            record => record.risk === "medium"
        ).length;

        highCount.textContent = records.filter(
            record => record.risk === "high"
        ).length;
    }

    // Search and filter assessments.
    function getFilteredAssessments() {

        const searchTerm =
            searchInput.value.toLowerCase().trim();

        const selectedRisk = riskFilter.value;
        const selectedDate = dateFilter.value;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return records.filter(function (record) {

            const matchesSearch = [
                record.title,
                record.company,
                record.date
            ].some(function (value) {
                return String(value)
                    .toLowerCase()
                    .includes(searchTerm);
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

    // Display assessment records.
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
                        "Assessment A" + record.id +
                        " selected. Individual result viewing " +
                        "will be connected next.";
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
            " matching assessment record(s).";

        pageInfo.textContent =
            "Page " + currentPage + " of " + totalPages;

        previousButton.disabled = currentPage === 1;
        nextButton.disabled = currentPage === totalPages;
    }

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


