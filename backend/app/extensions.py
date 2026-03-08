from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler
from flask_migrate import Migrate


scheduler = BackgroundScheduler()

db = SQLAlchemy()
cors = CORS()
migrate = Migrate()