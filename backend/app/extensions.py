from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler()

db = SQLAlchemy()
cors = CORS()
