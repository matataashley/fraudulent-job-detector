
import os
import re
from urllib.parse import urlsplit
from werkzeug.security import generate_password_hash, check_password_hash

from flask import Flask, render_template, request, jsonify, session, url_for, redirect, flash

from database import get_db_connection


app = Flask(__name__)

# Used to maintain the latest assessment ID between pages.
# A separate secret key should be configured before deployment.
app.secret_key = os.getenv(
    "FLASK_SECRET_KEY",
    "jobguard-development-key-change-before-deployment"
)


# ==========================================
# 1. ASSESSMENT ENGINE
# ==========================================

def assess_advertisement(company_name, job_title, job_description,
                         job_url, contact_info):

    advert_text = " ".join([
        company_name,
        job_title,
        job_description,
        job_url,
        contact_info
    ]).lower()

    findings = []

    def add_finding(category, points, severity, explanation):
        findings.append({
            "category": category,
            "weight": points,
            "severity": severity,
            "explanation": explanation
        })

    # 1. Upfront payment requests
    payment_phrases = [
        "registration fee",
        "application fee",
        "processing fee",
        "pay to secure",
        "upfront payment",
        "pay a fee",
        "recruitment fee"
    ]

    if any(phrase in advert_text for phrase in payment_phrases):
        add_finding(
            "Upfront payment requests",
            25,
            "High",
            "The advertisement contains language associated "
            "with recruitment or upfront payments."
        )

    # 2. Sensitive information requests
    sensitive_phrases = [
        "bank password",
        "bank pin",
        "bank account details",
        "send your id",
        "identity card number",
        "national id number",
        "share your password"
    ]

    if any(phrase in advert_text for phrase in sensitive_phrases):
        add_finding(
            "Sensitive information requests",
            25,
            "High",
            "The advertisement may request sensitive identity "
            "or financial information."
        )

    # 3. Unrealistic salary promises
    salary_patterns = [
        r"guaranteed (?:income|earnings|salary)",
        r"earn (?:up to )?(?:ksh|kes|kes\.|ksh\.)?\s*\d[\d,]*\s*(?:per|a)\s*(?:day|hour)",
        r"(?:ksh|kes)\s*[\d,]+\s*(?:per|a)\s*day",
        r"(?:ksh|kes)\s*[\d,]+\s*(?:per|a)\s*week",
        r"no experience (?:needed|required).{0,100}(?:ksh|kes)\s*[\d,]+"
    ]

    if any(re.search(pattern, advert_text, re.IGNORECASE)
           for pattern in salary_patterns):
        add_finding(
            "Unrealistic salary promises",
            15,
            "Medium",
            "The advertisement contains a salary or earnings "
            "claim that requires verification."
        )

    # 4. Urgency and pressure
    urgency_phrases = [
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
    ]

    if any(phrase in advert_text for phrase in urgency_phrases):
        add_finding(
            "Urgency and pressure",
            15,
            "Medium",
            "The advertisement uses language that may pressure "
            "applicants to act quickly."
        )

    # 5. Suspicious URL patterns
    shortener_domains = [
        "bit.ly",
        "tinyurl.com",
        "t.co",
        "is.gd",
        "cutt.ly",
        "shorturl.at"
    ]

    suspicious_url = False

    if job_url:
        try:
            parsed_url = urlsplit(job_url)
            hostname = (parsed_url.hostname or "").lower()

            if parsed_url.scheme and hostname:
                suspicious_url = (
                    any(
                        hostname == domain
                        or hostname.endswith("." + domain)
                        for domain in shortener_domains
                    )
                    or parsed_url.scheme != "https"
                )
        except ValueError:
            suspicious_url = False

    if job_url and suspicious_url:
        add_finding(
            "Suspicious contact details or URL patterns",
            10,
            "Low",
            "The supplied link uses a URL pattern that requires "
            "additional verification."
        )

    # 6. Incomplete advertisement details
    missing_details = []

    if len(company_name) < 3:
        missing_details.append("Limited company name details")

    if len(job_title) < 3:
        missing_details.append("Limited job title details")

    if len(job_description) < 80:
        missing_details.append("Very short job description")

    if not re.search(
        r"\b(requirements?|qualifications?|experience|skills|duties|responsibilities)\b",
        job_description,
        re.IGNORECASE
    ):
        missing_details.append(
            "No clear requirements or duties identified"
        )

    if missing_details:
        add_finding(
            "Incomplete advertisement details",
            10,
            "Low",
            "Some job information appears limited or unclear: "
            + "; ".join(missing_details)
        )

    # Calculate the weighted risk score.
    risk_score = min(
        sum(finding["weight"] for finding in findings),
        100
    )

    if risk_score < 25:
        risk_level = "Low"
    elif risk_score < 50:
        risk_level = "Medium"
    else:
        risk_level = "High"

    return risk_score, risk_level, findings


# ==========================================
# 2. EXISTING PAGE ROUTES
# ==========================================

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/check-job")
def check_job():
    return render_template("check-job.html")



@app.route("/results")
def results():

    # 1. Check for temporary results from a public visitor.
    public_result = session.pop("public_assessment_result", None)

    if public_result:
        return render_template(
            "results.html",
            assessment=public_result
        )

    # 2. Retrieve the saved assessment for a registered user.
    assessment_id = session.get("latest_assessment_id")
    user_id = session.get("user_id")

    if not assessment_id or not user_id:
        return render_template("results.html", assessment=None)

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT *
            FROM assessments
            WHERE assessment_id = %s AND user_id = %s
            """,
            (assessment_id, user_id)
        )

        assessment = cursor.fetchone()

        if assessment:
            cursor.execute(
                """
                SELECT category, weight, severity, explanation
                FROM assessment_findings
                WHERE assessment_id = %s
                """,
                (assessment_id,)
            )

            assessment["findings"] = cursor.fetchall()

    finally:
        cursor.close()
        connection.close()

    return render_template(
        "results.html",
        assessment=assessment
    )


@app.route("/login", methods=["GET", "POST"])
def login():

    if request.method == "POST":

        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        if not email or not password:
            return render_template(
                "login.html",
                error="Please enter your email and password."
            )

        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        try:
            cursor.execute(
                """
                SELECT user_id, full_name, email, password_hash, role
                FROM users
                WHERE email = %s
                """,
                (email,)
            )

            user = cursor.fetchone()

            if user and check_password_hash(
                user["password_hash"], password
            ):
                session.clear()
                session["user_id"] = user["user_id"]
                session["full_name"] = user["full_name"]
                session["role"] = user["role"]

                if user["role"] == "admin":
                    return redirect(url_for("admin_dashboard"))

                return redirect(url_for("dashboard"))

            return render_template(
                "login.html",
                error="Invalid email or password."
            )

        finally:
            cursor.close()
            connection.close()

    return render_template("login.html")
# ==========================================
# LOGOUT
# ==========================================

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))



@app.route("/register", methods=["GET", "POST"])
def register():

    if request.method == "POST":

        full_name = request.form.get("full_name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")

        # Validate required fields
        if not full_name or not email or not password or not confirm_password:
            return render_template(
                "register.html",
                error="Please complete all required fields."
            )

        # Check password confirmation
        if password != confirm_password:
            return render_template(
                "register.html",
                error="Passwords do not match."
            )

        # Check password length
        if len(password) < 8:
            return render_template(
                "register.html",
                error="Password must contain at least 8 characters."
            )

        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        try:
            # Check whether email already exists
            cursor.execute(
                "SELECT user_id FROM users WHERE email = %s",
                (email,)
            )

            existing_user = cursor.fetchone()

            if existing_user:
                return render_template(
                    "register.html",
                    error="An account with this email already exists."
                )

            # Hash password before storing it
            password_hash = generate_password_hash(password)

            cursor.execute("""
                INSERT INTO users
                (full_name, email, password_hash)
                VALUES (%s, %s, %s)
            """, (full_name, email, password_hash))

            connection.commit()

            return render_template(
                "register.html",
                success="Account created successfully. You can now log in."
            )

        except Exception:
            connection.rollback()
            return render_template(
                "register.html",
                error="Registration could not be completed. Please try again."
            )

        finally:
            cursor.close()
            connection.close()

    return render_template("register.html")




@app.route("/dashboard")
def dashboard():

    if "user_id" not in session:
        return redirect(url_for("login"))

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        user_id = session["user_id"]

        # Retrieve the logged-in user's account details.
        cursor.execute(
            """
            SELECT full_name, email
            FROM users
            WHERE user_id = %s
            """,
            (user_id,)
        )

        user = cursor.fetchone()

        if not user:
            session.clear()
            return redirect(url_for("login"))

        # Calculate assessment statistics for this user.
        cursor.execute(
            """
            SELECT
                COUNT(*) AS total_assessments,
                COALESCE(SUM(risk_level = 'Low'), 0) AS low_risk,
                COALESCE(SUM(risk_level = 'Medium'), 0) AS medium_risk,
                COALESCE(SUM(risk_level = 'High'), 0) AS high_risk
            FROM assessments
            WHERE user_id = %s
            """,
            (user_id,)
        )

        stats = cursor.fetchone()

        # Retrieve the five most recent assessments.
        cursor.execute(
            """
            SELECT
                assessment_id,
                company_name,
                job_title,
                risk_score,
                risk_level,
                DATE_FORMAT(assessed_at, '%Y-%m-%d') AS assessed_date
            FROM assessments
            WHERE user_id = %s
            ORDER BY assessed_at DESC
            LIMIT 5
            """,
            (user_id,)
        )

        recent_assessments = cursor.fetchall()
                # Retrieve reports submitted by the logged-in user.
        cursor.execute(
            """
            SELECT
                report_id,
                company_name,
                job_title,
                report_reason,
                status,
                DATE_FORMAT(reported_at, '%Y-%m-%d') AS reported_date
            FROM reported_ads
            WHERE user_id = %s
            ORDER BY reported_at DESC
            """,
            (user_id,)
        )

        my_reports = cursor.fetchall()

    finally:
        cursor.close()
        connection.close()

        return render_template(
        "dashboard.html",
        user=user,
        stats=stats,
        recent_assessments=recent_assessments,
        my_reports=my_reports
    )
@app.route("/update-profile", methods=["POST"])
def update_profile():

    if "user_id" not in session:
        return redirect(url_for("login"))

    full_name = request.form.get("full_name", "").strip()
    email = request.form.get("email", "").strip().lower()

    if not full_name or not email:
        flash("Please enter your full name and email address.", "error")
        return redirect(url_for("dashboard") + "#account-settings")

    if len(full_name) > 100 or len(email) > 150:
        flash("Your name or email address is too long.", "error")
        return redirect(url_for("dashboard") + "#account-settings")

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT user_id
            FROM users
            WHERE email = %s AND user_id != %s
            """,
            (email, session["user_id"])
        )

        existing_user = cursor.fetchone()

        if existing_user:
            flash("That email address is already registered.", "error")
            return redirect(url_for("dashboard") + "#account-settings")

        cursor.execute(
            """
            UPDATE users
            SET full_name = %s, email = %s
            WHERE user_id = %s
            """,
            (full_name, email, session["user_id"])
        )

        connection.commit()

        session["full_name"] = full_name

        flash("Your profile has been updated successfully.", "success")

    finally:
        cursor.close()
        connection.close()

    return redirect(url_for("dashboard") + "#account-settings")

# ==========================================
# ADMIN DASHBOARD
# ==========================================

@app.route("/admin-dashboard")
def admin_dashboard():

    # Only logged-in administrators can access this page.
    if "user_id" not in session:
        return redirect(url_for("login"))

    if session.get("role") != "admin":
        return redirect(url_for("dashboard"))

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Count registered users.
        cursor.execute("SELECT COUNT(*) AS total_users FROM users")
        total_users = cursor.fetchone()["total_users"]

        # Count all job assessments.
        cursor.execute(
            "SELECT COUNT(*) AS total_assessments FROM assessments"
        )
        total_assessments = cursor.fetchone()["total_assessments"]

        # Count all submitted reports.
        cursor.execute(
            "SELECT COUNT(*) AS total_reports FROM reported_ads"
        )
        total_reports = cursor.fetchone()["total_reports"]

        # Count reports awaiting review.
        cursor.execute(
            """
            SELECT COUNT(*) AS pending_reports
            FROM reported_ads
            WHERE status = 'Pending'
            """
        )
        pending_reports = cursor.fetchone()["pending_reports"]

    finally:
        cursor.close()
        connection.close()

    stats = {
        "total_users": total_users,
        "total_assessments": total_assessments,
        "total_reports": total_reports,
        "pending_reports": pending_reports
    }

    return render_template(
        "admin-dashboard.html",
        stats=stats
    )

# ==========================================
# ADMIN REPORTS
# ==========================================

@app.route("/admin-reports")
def admin_reports():

    # Only logged-in administrators can access this page.
    if "user_id" not in session:
        return redirect(url_for("login"))

    if session.get("role") != "admin":
        return redirect(url_for("dashboard"))

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                report_id,
                reporter_name,
                company_name,
                job_title,
                job_url,
                report_reason,
                additional_details,
                status,
                reported_at
            FROM reported_ads
            ORDER BY reported_at DESC
        """)

        reports = cursor.fetchall()

    finally:
        cursor.close()
        connection.close()

    return render_template(
        "admin-reports.html",
        reports=reports
    )


@app.route("/my-assessments")
def my_assessments():

    # Require the user to be logged in.
    if "user_id" not in session:
        return redirect(url_for("login"))

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                assessment_id,
                company_name,
                job_title,
                risk_score,
                risk_level,
                assessed_at
            FROM assessments
            WHERE user_id = %s
            ORDER BY assessed_at DESC
        """, (session["user_id"],))

        assessments = cursor.fetchall()

    finally:
        cursor.close()
        connection.close()

    for assessment in assessments:
        assessment["assessed_at"] = (
            assessment["assessed_at"].strftime("%Y-%m-%d")
        )

    return render_template(
        "my-assessments.html",
        assessments=assessments
    )

# ==========================================
# UPDATE REPORT STATUS
# ==========================================

@app.route("/update-report-status/<int:report_id>", methods=["POST"])
def update_report_status(report_id):

    # Check whether the user is logged in.
    if "user_id" not in session:
        return redirect(url_for("login"))

    # Only administrators can update report statuses.
    if session.get("role") != "admin":
        return redirect(url_for("dashboard"))

    # Get the selected status from the form.
    new_status = request.form.get("status")

    # Only allow these three statuses.
    allowed_statuses = ["Pending", "Under Review", "Resolved"]

    if new_status not in allowed_statuses:
        return redirect(url_for("admin_reports"))

    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE reported_ads
            SET status = %s
            WHERE report_id = %s
            """,
            (new_status, report_id)
        )

        connection.commit()

    finally:
        cursor.close()
        connection.close()

    return redirect(url_for("admin_reports"))


@app.route("/report-ad")
def report_ad():
    return render_template("report-ad.html")
    # ==========================================
# REPORT ADVERTISEMENT SUBMISSION
# ==========================================

@app.route("/submit-report", methods=["POST"])
def submit_report():

    # Retrieve submitted form information.
    reporter_name = request.form.get("reporter_name", "").strip()
    company_name = request.form.get("company_name", "").strip()
    job_title = request.form.get("job_title", "").strip()
    job_url = request.form.get("job_url", "").strip()
    report_reason = request.form.get("report_reason", "").strip()
    additional_details = request.form.get("additional_details", "").strip()

    # Validate required fields.
    if not all([
        reporter_name,
        company_name,
        job_title,
        report_reason,
        additional_details
    ]):
        return render_template(
            "report-ad.html",
            error="Please complete all required fields."
        )

    if len(reporter_name) > 100 or len(company_name) > 150:
        return render_template(
            "report-ad.html",
            error="One or more fields exceed the allowed length."
        )

    if len(job_title) > 150:
        return render_template(
            "report-ad.html",
            error="The job title is too long."
        )

    # Get the logged-in user's ID, if available.
    user_id = session.get("user_id")

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute(
            """
            INSERT INTO reported_ads (
                user_id,
                reporter_name,
                company_name,
                job_title,
                job_url,
                report_reason,
                additional_details
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_id,
                reporter_name,
                company_name,
                job_title,
                job_url or None,
                report_reason,
                additional_details
            )
        )

        connection.commit()

        return render_template(
            "report-ad.html",
            success="Your report has been submitted successfully. Thank you for helping protect other job seekers."
        )

    except Exception:
        if connection:
            connection.rollback()

        app.logger.exception("Job advertisement report could not be saved.")

        return render_template(
            "report-ad.html",
            error="Your report could not be submitted. Please try again."
        )

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()


# ==========================================
# 3. ASSESSMENT SUBMISSION ROUTE
# ==========================================


@app.route("/assess-job", methods=["POST"])
def assess_job():

    data = request.get_json(silent=True) or request.form

    company_name = (
        data.get("companyName")
        or data.get("company-name")
        or ""
    ).strip()

    job_title = (
        data.get("jobTitle")
        or data.get("job-title")
        or ""
    ).strip()

    job_description = (
        data.get("jobDescription")
        or data.get("job-description")
        or ""
    ).strip()

    job_url = (
        data.get("jobUrl")
        or data.get("job-url")
        or ""
    ).strip()

    contact_info = (
        data.get("contactInfo")
        or data.get("contact-info")
        or ""
    ).strip()

    if not company_name or not job_title or not job_description:
        return jsonify({
            "success": False,
            "message": "Please complete all required fields."
        }), 400

    # Run the assessment.
    risk_score, risk_level, findings = assess_advertisement(
        company_name,
        job_title,
        job_description,
        job_url,
        contact_info
    )

    # Prepare the result for the results page.
    assessment_result = {
        "company_name": company_name,
        "job_title": job_title,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "findings": findings
    }

    # Public users receive results without database storage.
    if "user_id" not in session:
        session.pop("latest_assessment_id", None)
        session["public_assessment_result"] = assessment_result

        return jsonify({
            "success": True,
            "message": "Assessment completed successfully.",
            "assessment_id": None,
            "redirect_url": url_for("results")
        })

    # Registered users have their assessments saved.
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO assessments (
                user_id,
                company_name,
                job_title,
                job_description,
                job_url,
                contact_info,
                risk_score,
                risk_level
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                session["user_id"],
                company_name,
                job_title,
                job_description,
                job_url or None,
                contact_info or None,
                risk_score,
                risk_level
            )
        )

        assessment_id = cursor.lastrowid

        for finding in findings:
            cursor.execute(
                """
                INSERT INTO assessment_findings (
                    assessment_id,
                    category,
                    weight,
                    severity,
                    explanation
                )
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    assessment_id,
                    finding["category"],
                    finding["weight"],
                    finding["severity"],
                    finding["explanation"]
                )
            )

        connection.commit()

        session["latest_assessment_id"] = assessment_id
        session.pop("public_assessment_result", None)

        return jsonify({
            "success": True,
            "message": "Assessment completed successfully.",
            "assessment_id": assessment_id,
            "redirect_url": url_for("results")
        })

    except Exception:
        connection.rollback()
        app.logger.exception("Assessment could not be saved.")

        return jsonify({
            "success": False,
            "message": "The assessment could not be saved. Please try again."
        }), 500

    finally:
        cursor.close()
        connection.close()



# ==========================================
# 4. RUN APPLICATION
# ==========================================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

# ==========================================
# LOGOUT
# ==========================================


