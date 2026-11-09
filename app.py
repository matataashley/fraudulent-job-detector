
from flask import Flask, render_template

app = Flask(__name__)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/check-job")
def check_job():
    return render_template("check-job.html")


@app.route("/results")
def results():
    return render_template("results.html")


@app.route("/login")
def login():
    return render_template("login.html")


@app.route("/register")
def register():
    return render_template("register.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@app.route("/my-assessments")
def my_assessments():
    return render_template("my-assessments.html")


@app.route("/report-ad")
def report_ad():
    return render_template("report-ad.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
