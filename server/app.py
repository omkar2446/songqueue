import os
import uuid
import datetime
import jwt
import requests
import logging
import traceback
import threading
import time
import pandas as pd
import re
from functools import wraps

from flask import Flask, request, jsonify, send_from_directory, Response, make_response
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text, desc, inspect
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import yt_dlp

# 1. ── Logging & Config ──
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv()

# 2. ── Constants & Whitelists ──
PRO_EMAILS = ['otambe655@gmail.com', 'SOlove1@gmail.com']

# 3. ── App Initialization ──
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'supersecretkey-change-this')

# Store application data locally when SQLite is active.
base_dir = os.path.dirname(os.path.abspath(__file__))
db_dir = os.path.join(base_dir, 'data')
upload_dir = os.path.join(base_dir, 'uploads')
is_render_environment = any(os.getenv(key) for key in ['RENDER', 'RENDER_SERVICE_ID', 'RENDER_INSTANCE_ID'])

os.makedirs(db_dir, exist_ok=True)
os.makedirs(upload_dir, exist_ok=True)

db_path = os.path.join(db_dir, 'songqueue.db').replace('\\', '/')
excel_path = os.path.join(db_dir, 'songqueue.xlsx').replace('\\', '/')
json_path = os.path.join(db_dir, 'songqueue.json').replace('\\', '/')
app.config['SQLITE_DB_PATH'] = db_path
app.config['UPLOAD_FOLDER'] = upload_dir
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
os.makedirs(app.instance_path, exist_ok=True)

def normalize_database_url(database_url):
    if database_url and database_url.startswith('postgres://'):
        return database_url.replace('postgres://', 'postgresql://', 1)
    return database_url

def get_configured_database_uri():
    raw_database_url = (
        os.getenv('DATABASE_URL')
        or os.getenv('RENDER_DATABASE_URL')
        or os.getenv('RENDER_EXTERNAL_DATABASE_URL')
        or os.getenv('SQLALCHEMY_DATABASE_URI')
    )
    normalized_database_url = normalize_database_url(raw_database_url)
    if normalized_database_url:
        logger.info("Using PostgreSQL database from environment variable.")
        return normalized_database_url
    logger.warning("No DATABASE_URL found! Falling back to local SQLite: %s", db_path)
    return f"sqlite:///{db_path}"

def mask_db_uri(uri):
    """Mask password in database URI for safe logging."""
    if '://' in uri and '@' in uri:
        prefix = uri.split('://')[0]
        after_at = uri.split('@', 1)[1]
        return f"{prefix}://***:***@{after_at}"
    return uri

final_db_uri = get_configured_database_uri()
app.config['SQLALCHEMY_DATABASE_URI'] = final_db_uri
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True
}

logger.info("=" * 60)
logger.info("DATABASE URI (masked): %s", mask_db_uri(final_db_uri))
logger.info("=" * 60)

db = SQLAlchemy(app)

def get_database_backend():
    database_uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
    if database_uri.startswith('postgresql://'):
        return 'postgresql'
    return 'sqlite'

def is_sqlite_database():
    return get_database_backend() == 'sqlite'

def get_storage_mode():
    if not is_sqlite_database():
        return 'managed_postgres'
    if is_render_environment:
        return 'sqlite_file_on_host'
    return 'sqlite_file'

def get_database_path():
    if is_sqlite_database():
        return app.config['SQLITE_DB_PATH']
    return None

# 4. ── SocketIO Setup ──
socketio = SocketIO(
    app, 
    cors_allowed_origins="*", 
    async_mode='threading',
    logger=True, 
    engineio_logger=True
)
CORS(app)


class Room(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    owner_id = db.Column(db.String(36), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    current_song_id = db.Column(db.String(36), nullable=True)
    is_playing = db.Column(db.Boolean, default=False)
    playback_time = db.Column(db.Float, default=0.0)
    repeat_mode = db.Column(db.Boolean, default=False)
    repeat_type = db.Column(db.Integer, default=0) # 0: none, 1: all, 2: one
    shuffle_mode = db.Column(db.Boolean, default=False)
    last_updated_at = db.Column(db.DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

class User(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=True)
    phone = db.Column(db.String(20))
    room_id = db.Column(db.String(36), db.ForeignKey('room.id'), nullable=True)
    is_admin = db.Column(db.Boolean, default=False)
    is_pro = db.Column(db.Boolean, default=False)
    session_id = db.Column(db.String(100))

class Playlist(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey('user.id'))
    is_public = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

class PlaylistSong(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    playlist_id = db.Column(db.String(36), db.ForeignKey('playlist.id'))
    title = db.Column(db.String(200), nullable=False)
    artist = db.Column(db.String(100))
    duration = db.Column(db.Integer)
    source = db.Column(db.String(20))
    source_id = db.Column(db.String(255))
    thumbnail = db.Column(db.String(500))
    url = db.Column(db.Text, nullable=True) # Direct access URL if needed
    created_at = db.Column(db.DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

class Song(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    artist = db.Column(db.String(100))
    duration = db.Column(db.Integer)
    source = db.Column(db.String(20))
    source_id = db.Column(db.String(255))
    thumbnail = db.Column(db.String(500))
    url = db.Column(db.Text, nullable=True) # Direct access URL if needed
    added_by_name = db.Column(db.String(100))
    room_id = db.Column(db.String(36), db.ForeignKey('room.id'))
    votes = db.Column(db.Integer, default=0)
    position = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

SCHEMA_MIGRATIONS = {
    'user': [
        ('is_pro', 'BOOLEAN DEFAULT FALSE'),
        ('is_admin', 'BOOLEAN DEFAULT FALSE'),
        ('room_id', 'VARCHAR(36)'),
        ('password_hash', 'VARCHAR(255)')
    ],
    'room': [
        ('current_song_id', 'VARCHAR(36)'),
        ('is_playing', 'BOOLEAN DEFAULT FALSE'),
        ('playback_time', 'FLOAT DEFAULT 0'),
        ('repeat_type', 'INTEGER DEFAULT 0'),
        ('shuffle_mode', 'BOOLEAN DEFAULT FALSE'),
        ('created_at', 'TIMESTAMP'),
        ('expires_at', 'TIMESTAMP'),
        ('name', 'VARCHAR(100)'),
        ('owner_id', 'VARCHAR(36)'),
        ('last_updated_at', 'TIMESTAMP')
    ],
    'playlist_song': [
        ('url', 'TEXT')
    ],
    'song': [
        ('url', 'TEXT'),
        ('position', 'INTEGER DEFAULT 0'),
        ('votes', 'INTEGER DEFAULT 0'),
        ('added_by_name', 'VARCHAR(100)')
    ],
    'playlist': [
        ('is_public', 'BOOLEAN DEFAULT FALSE')
    ]
}

def run_schema_migrations():
    inspector = inspect(db.engine)
    existing_tables = set(inspector.get_table_names())

    with db.engine.connect() as conn:
        for table_name, columns in SCHEMA_MIGRATIONS.items():
            if table_name not in existing_tables:
                continue

            existing_columns = {column['name'] for column in inspector.get_columns(table_name)}
            quoted_table_name = f'"{table_name}"'

            for column_name, column_definition in columns:
                if column_name in existing_columns:
                    continue

                stmt = text(
                    f'ALTER TABLE {quoted_table_name} ADD COLUMN {column_name} {column_definition}'
                )
                try:
                    conn.execute(stmt)
                    conn.commit()
                    logger.info(
                        "Migration Success: ALTER TABLE %s ADD COLUMN %s %s",
                        table_name,
                        column_name,
                        column_definition
                    )
                except Exception as exc:
                    conn.rollback()
                    logger.warning(
                        "Migration skipped for %s.%s: %s",
                        table_name,
                        column_name,
                        str(exc)
                    )

def initialize_database():
    retry_count = 0
    max_retries = 5 if not is_sqlite_database() else 3

    while retry_count < max_retries:
        try:
            db.create_all()
            db.session.execute(text('SELECT 1'))
            db.session.commit()
            run_schema_migrations()

            # Verify tables were actually created
            table_inspector = inspect(db.engine)
            created_tables = table_inspector.get_table_names()

            logger.info("=" * 60)
            logger.info("DATABASE READY: %s", get_database_backend().upper())
            logger.info("Tables found: %s", created_tables)
            if is_sqlite_database():
                logger.info("SQLite path: %s", db_path)
            else:
                logger.info("PostgreSQL connection active.")
            logger.info("=" * 60)
            return
        except Exception as exc:
            db.session.rollback()
            retry_count += 1
            logger.warning(
                "DB connection retry %s/%s: %s",
                retry_count,
                max_retries,
                str(exc)[:120]
            )
            if retry_count >= max_retries:
                logger.error("CRITICAL: Database connection failed after %s retries.", max_retries)
                logger.error("URI was: %s", mask_db_uri(app.config.get('SQLALCHEMY_DATABASE_URI', '')))
                raise
            time.sleep(2)

with app.app_context():
    initialize_database()

# 5.5 ── Automated Data Synchronizer ──
last_backup_mtime = 0
def sync_database_backups():
    if not is_sqlite_database():
        logger.info("Skipping backup sync because the active database backend is PostgreSQL.")
        return False

    try:
        import sqlite3, json
        if not os.path.exists(db_path):
            return False
        conn = sqlite3.connect(db_path)
        tables = pd.read_sql("SELECT name FROM sqlite_master WHERE type='table'", conn)
        
        json_data = {}
        with pd.ExcelWriter(excel_path, engine='openpyxl') as writer:
            for table_name in tables['name']:
                df = pd.read_sql(f"SELECT * from {table_name}", conn)
                df.to_excel(writer, sheet_name=table_name[:31], index=False)
                json_data[table_name] = df.to_dict(orient='records')
                
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, default=str, indent=4)
            
        conn.close()
        logger.info(f"Database synchronized! Copies updated: Excel & JSON")
        return True
    except Exception as e:
        logger.error(f"Error during backup sync: {e}")
        return False

def trigger_database_sync():
    if is_sqlite_database():
        threading.Thread(target=sync_database_backups, daemon=True).start()

def auto_db_backup():
    global last_backup_mtime
    if not is_sqlite_database():
        return
    time.sleep(5) # Let server boot up
    while True:
        try:
            if os.path.exists(db_path):
                current_mtime = os.path.getmtime(db_path)
                if current_mtime > last_backup_mtime:
                    sync_database_backups()
                    last_backup_mtime = current_mtime
        except Exception:
            pass
        time.sleep(3) # Continuously check for changes every 3 seconds

if is_sqlite_database():
    backup_thread = threading.Thread(target=auto_db_backup, daemon=True)
    backup_thread.start()

# 6. ── Auth Helpers ──
def create_token(user_id):
    payload = {
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7),
        'iat': datetime.datetime.now(datetime.timezone.utc),
        'sub': user_id
    }
    return jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token: return jsonify({'error': 'Token missing'}), 401
        try:
            data = jwt.decode(token.replace('Bearer ', ''), app.config['SECRET_KEY'], algorithms=['HS256'])
            current_user_id = data['sub']
        except: return jsonify({'error': 'Token invalid'}), 401
        return f(current_user_id, *args, **kwargs)
    return decorated

# 7. ── CORE ROUTES ──

@app.route('/test', methods=['GET'])
def test_db():
    """Diagnostic route: creates tables, inserts a test user, and reports table status."""
    try:
        # Force table creation
        db.create_all()

        # Insert a test user
        uid = str(uuid.uuid4())
        test_user = User(
            id=uid,
            name=f"TestUser_{uid[:6]}",
            email=f"test_{uid[:8]}@example.com",
            password_hash=generate_password_hash("testpass123")
        )
        db.session.add(test_user)
        db.session.commit()

        # Verify: list all tables and row counts
        table_inspector = inspect(db.engine)
        tables = table_inspector.get_table_names()
        table_counts = {}
        for t in tables:
            try:
                count = db.session.execute(text(f'SELECT COUNT(*) FROM "{t}"')).scalar()
                table_counts[t] = count
            except Exception:
                table_counts[t] = 'error'

        return jsonify({
            "status": "success",
            "message": "Database is working! Test user inserted.",
            "database_backend": get_database_backend(),
            "database_uri_masked": mask_db_uri(app.config.get('SQLALCHEMY_DATABASE_URI', '')),
            "test_user_id": uid,
            "tables_found": tables,
            "row_counts": table_counts
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Test route error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            "status": "error",
            "message": str(e),
            "database_backend": get_database_backend(),
            "database_uri_masked": mask_db_uri(app.config.get('SQLALCHEMY_DATABASE_URI', ''))
        }), 500

@app.route('/db-info', methods=['GET'])
def db_info():
    """Returns current database connection info for debugging."""
    try:
        table_inspector = inspect(db.engine)
        tables = table_inspector.get_table_names()
        table_counts = {}
        for t in tables:
            try:
                count = db.session.execute(text(f'SELECT COUNT(*) FROM "{t}"')).scalar()
                table_counts[t] = count
            except Exception:
                table_counts[t] = 'error'

        return jsonify({
            "database_backend": get_database_backend(),
            "database_uri_masked": mask_db_uri(app.config.get('SQLALCHEMY_DATABASE_URI', '')),
            "storage_mode": get_storage_mode(),
            "is_render": is_render_environment,
            "tables": tables,
            "row_counts": table_counts,
            "env_DATABASE_URL_set": bool(os.getenv('DATABASE_URL')),
            "env_RENDER_DATABASE_URL_set": bool(os.getenv('RENDER_DATABASE_URL')),
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/')
def health_check():
    return jsonify({
        "status": "online",
        "service": "SongQueue API",
        "runtime": "threading",
        "database_backend": get_database_backend(),
        "database_uri_masked": mask_db_uri(app.config.get('SQLALCHEMY_DATABASE_URI', '')),
        "storage_mode": get_storage_mode(),
        "database_path": get_database_path(),
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    })

@app.route('/api/admin/export-data')
def manual_export_endpoint():
    if not is_sqlite_database():
        return jsonify({
            "success": False,
            "message": "Manual export is only available when the app is using SQLite.",
            "database_backend": get_database_backend()
        }), 400
    sync_database_backups()
    return jsonify({"success": True, "excel": excel_path, "json": json_path})

@app.route('/api/uploads/<path:filename>')
def serve_upload(filename):
    resp = make_response(send_from_directory(app.config['UPLOAD_FOLDER'], filename))
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Range, Content-Type'
    # Allow range requests for audio scrubbing
    resp.headers['Accept-Ranges'] = 'bytes'
    return resp

# In-memory cache for YouTube URLs to speed up seeking and range requests
yt_url_cache = {} # video_id -> (url, expires_at)

@app.route('/api/yt/stream/<video_id>', methods=['GET', 'HEAD', 'OPTIONS'])
def stream_yt(video_id):
    if request.method == 'OPTIONS':
        resp = Response()
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Range, Content-Type, Authorization'
        return resp

    now = datetime.datetime.now(datetime.timezone.utc)
    
    cached_url = None
    if video_id in yt_url_cache:
        url, expiry = yt_url_cache[video_id]
        if now < expiry:
            cached_url = url

    if not cached_url:
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'ignoreerrors': False,
            'logtostderr': False,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'referer': 'https://www.youtube.com/',
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                if not info or 'url' not in info:
                    raise Exception("No streaming URL found in YouTube response")
                cached_url = info['url']
                yt_url_cache[video_id] = (cached_url, now + datetime.timedelta(hours=1))
        except Exception as e:
            logger.error(f"YouTube Extract Error for {video_id}: {str(e)}")
            return jsonify({'error': f'YouTube Resolution Failed: {str(e)}'}), 500

    headers = {}
    if 'Range' in request.headers:
        headers['Range'] = request.headers['Range']

    try:
        # Use HEAD if request is HEAD
        if request.method == 'HEAD':
            r = requests.head(cached_url, headers=headers, timeout=10)
            if r.status_code == 403:
                # Cache might be stale, clear and retry once
                if video_id in yt_url_cache: del yt_url_cache[video_id]
                return stream_yt(video_id)
            resp = Response(status=r.status_code)
            for k, v in r.headers.items():
                if k.lower() in ['content-type', 'content-length', 'accept-ranges', 'content-range']:
                    resp.headers[k] = v
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp

        proxy_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Referer': 'https://www.youtube.com/',
            'Range': headers.get('Range', 'bytes=0-')
        }
        r = requests.get(cached_url, headers=proxy_headers, stream=True, timeout=15)
        
        if r.status_code == 403:
             # URL likely expired or session blocked
             logger.warning(f"YouTube 403 for {video_id}, clearing cache and retrying...")
             if video_id in yt_url_cache: del yt_url_cache[video_id]
             # To avoid infinite loops, we don't call recursively here, 
             # but instead return 500 with a specific message so frontend can fallback.
             return jsonify({'error': 'YouTube proxy session expired. Please refresh.'}), 500
        
        def generate():
            try:
                for chunk in r.iter_content(chunk_size=1024*128):
                    yield chunk
            except Exception as e:
                logger.error(f"Stream generation error: {str(e)}")

        resp = Response(generate(), status=r.status_code)
        for k, v in r.headers.items():
            if k.lower() in ['content-type', 'content-length', 'accept-ranges', 'content-range']:
                resp.headers[k] = v
        
        # Critical: Allow Web Audio API to capture this stream
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Range, Content-Type, Authorization'
        resp.headers['Access-Control-Expose-Headers'] = 'Content-Length, Content-Range, Accept-Ranges'
        return resp
    except Exception as e:
        logger.error(f"YouTube Proxy Error: {str(e)}")
        return jsonify({'error': 'Failed to stream audio'}), 500

@app.route('/api/spotify/resolve', methods=['POST', 'OPTIONS'])
def resolve_spotify():
    if request.method == 'OPTIONS':
        resp = Response()
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return resp
        
    data = request.json or {}
    url = data.get('url')
    if not url: return jsonify({'error': 'URL missing'}), 400
    
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'}
    try:
        html = requests.get(url, headers=headers, timeout=10).text
        
        # 1. Try to extract track title
        title = ""
        tm = re.search(r'<meta property="og:title" content="([^"]+)"', html)
        if not tm: tm = re.search(r'<meta name="twitter:title" content="([^"]+)"', html)
        if not tm: tm = re.search(r'<title>([^<]+)</title>', html)
        if tm:
            title = tm.group(1).replace(" | Spotify", "").replace(" - song and lyrics by", "").split(" - song by")[0].strip()

        # 2. Try to extract artist
        artist = ""
        dm = re.search(r'<meta property="og:description" content="([^"]+)"', html)
        if dm:
            desc = dm.group(1)
            # Typically: "Artist Name · Song · Year" or "Artist Name · Album · Date"
            if " · " in desc:
                artist = desc.split(" · ")[0].strip()
        
        if not artist:
            # Fallback for artist: look into title tag which often says "Song Name - song by Artist | Spotify"
            tm_full = re.search(r'<title>([^<]+)</title>', html)
            if tm_full and " - song by " in tm_full.group(1):
                artist = tm_full.group(1).split(" - song by ")[1].split(" | Spotify")[0].strip()
        
        logger.info(f"Resolving Spotify: Title='{title}', Artist='{artist}'")
        
        if not title: return jsonify({'error': 'Could not extract song info'}), 400

        # Sanitize query for better YouTube search
        clean_title = re.sub(r'\(feat\..*?\)', '', title, flags=re.IGNORECASE)
        clean_title = re.sub(r'\[.*?\]', '', clean_title).strip()
        
        # Strategy: Search multiple queries if needed
        queries = [
            f"{clean_title} {artist} audio",
            f"{clean_title} {artist} official music video",
            f"{title} {artist}"
        ]
        
        best_entry = None
        max_score = -1
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            for q_idx, q in enumerate(queries):
                # Only try fallback queries if we haven't found a decent match yet
                if max_score >= 18: break 
                
                # Fetch more entries on the first/best query
                limit = 10 if q_idx == 0 else 5
                search_query = f"ytsearch{limit}:{q}"
                info = ydl.extract_info(search_query, download=False)
                
                if 'entries' in info and len(info['entries']) > 0:
                    for entry in info['entries']:
                        score = 0
                        yt_title = entry.get('title', '').lower()
                        yt_uploader = entry.get('uploader', '').lower()
                        yt_duration = entry.get('duration') or 0
                        
                        # A. Channel Credibility (High Priority)
                        if 'topic' in yt_uploader: score += 15
                        if 'official' in yt_uploader: score += 8
                        if 'vevo' in yt_uploader: score += 6
                        
                        # B. Artist Name Match (Very High Priority)
                        if artist and artist.lower() in yt_uploader: score += 15
                        elif artist and artist.lower() in yt_title: score += 5
                        
                        # C. Title Similarity
                        # Simple word-based match count
                        words = clean_title.lower().split()
                        match_count = sum(1 for w in words if len(w) > 2 and w in yt_title)
                        score += (match_count / max(len(words), 1)) * 10
                        
                        # D. Type Identification
                        if 'official' in yt_title and 'audio' in yt_title: score += 5
                        elif 'official' in yt_title: score += 3
                        
                        # E. Duration Checks (songs are usually 1.5 to 8 mins)
                        if yt_duration < 60 or yt_duration > 600: score -= 20
                        
                        # F. Penalties for bad matches
                        unwanted = ['cover', 'karaoke', 'live', 'tribute', 'parody', 'instrumental', 'remix']
                        for term in unwanted:
                            if term in yt_title and term not in title.lower():
                                score -= 30
                        
                        if score > max_score:
                            max_score = score
                            best_entry = entry
                            
        if best_entry:
            logger.info(f"Matched: '{best_entry.get('title')}' by '{best_entry.get('uploader')}' (Score: {max_score})")
            return jsonify({
                'success': True,
                'youtube_id': best_entry.get('id'),
                'title': title or best_entry.get('title'),
                'artist': artist or best_entry.get('uploader'),
                'thumbnail': f"https://img.youtube.com/vi/{best_entry.get('id')}/hqdefault.jpg",
                'duration': best_entry.get('duration', 0),
                '_is_collection': False
            })
                    
        return jsonify({'error': 'Not found on YouTube'}), 404

        
    except Exception as e:
        logger.error(f"Spotify resolve error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# 8. ── Playlists API ──
@app.route('/api/playlists', methods=['GET'])
@token_required
def get_playlists(user_id):
    playlists = Playlist.query.filter_by(user_id=user_id).all()
    # Also fetch public playlists NOT owned by the user
    public_playlists = Playlist.query.filter((Playlist.is_public == True) & (Playlist.user_id != user_id)).all()
    
    def serialize_p(p, is_own=True):
        owner = db.session.get(User, p.user_id)
        return {
            'id': p.id,
            'name': p.name,
            'is_public': p.is_public,
            'owner': owner.name if owner and not is_own else 'Me',
            'count': PlaylistSong.query.filter_by(playlist_id=p.id).count()
        }

    return jsonify({
        'my_playlists': [serialize_p(p) for p in playlists],
        'public_playlists': [serialize_p(p, False) for p in public_playlists]
    })

@app.route('/api/playlists/<pid>/toggle-public', methods=['POST'])
@token_required
def toggle_playlist_visibility(user_id, pid):
    p = Playlist.query.filter_by(id=pid, user_id=user_id).first()
    if not p: return jsonify({'error': 'Not found'}), 404
    p.is_public = not p.is_public
    db.session.commit()
    return jsonify({'success': True, 'is_public': p.is_public})

@app.route('/api/playlists', methods=['POST'])
@token_required
def create_playlist(user_id):
    data = request.get_json(silent=True) or {}
    playlist_name = (data.get('name') or '').strip()
    if not playlist_name:
        return jsonify({'error': 'Playlist name is required'}), 400

    p = Playlist(id=str(uuid.uuid4()), name=playlist_name, user_id=user_id)
    db.session.add(p)
    db.session.commit()
    return jsonify({'id': p.id, 'name': p.name})

@app.route('/api/playlists/<pid>', methods=['GET'])
@token_required
def get_playlist_songs(user_id, pid):
    p = db.session.get(Playlist, pid)
    if not p:
        return jsonify({'error': 'Not found'}), 404
    if p.user_id != user_id and not p.is_public:
        return jsonify({'error': 'Not found'}), 404

    owner = db.session.get(User, p.user_id)
    songs = PlaylistSong.query.filter_by(playlist_id=pid).order_by(PlaylistSong.created_at.asc()).all()
    return jsonify({
        'id': p.id,
        'name': p.name,
        'is_public': p.is_public,
        'owner': owner.name if owner else 'Unknown',
        'songs': [{
            'id': s.id, 'title': s.title, 'artist': s.artist, 
            'duration': s.duration, 'source': s.source, 
            'source_id': s.source_id, 'thumbnail': s.thumbnail,
            'url': s.url
        } for s in songs]
    })

@app.route('/api/playlists/<pid>/songs', methods=['POST'])
@token_required
def add_to_playlist(user_id, pid):
    p = Playlist.query.filter_by(id=pid, user_id=user_id).first()
    if not p: return jsonify({'error': 'Not found'}), 404
    d = request.json
    s = PlaylistSong(
        id=str(uuid.uuid4()), playlist_id=pid,
        title=d.get('title', 'Unknown'), 
        artist=d.get('artist', 'Unknown'),
        duration=d.get('duration', 0), 
        source=d.get('source', 'unknown'),
        source_id=d.get('source_id', ''), 
        thumbnail=d.get('thumbnail', ''),
        url=d.get('url', '')
    )
    db.session.add(s)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/playlists/<pid>', methods=['DELETE'])
@token_required
def delete_playlist(user_id, pid):
    p = Playlist.query.filter_by(id=pid, user_id=user_id).first()
    if not p:
        return jsonify({'error': 'Not found'}), 404

    PlaylistSong.query.filter_by(playlist_id=pid).delete()
    db.session.delete(p)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/playlists/<pid>/songs/<sid>', methods=['DELETE'])
@token_required
def remove_from_playlist(user_id, pid, sid):
    p = Playlist.query.filter_by(id=pid, user_id=user_id).first()
    if not p: return jsonify({'error': 'Not found'}), 404
    s = PlaylistSong.query.filter_by(id=sid, playlist_id=pid).first()
    if s:
        db.session.delete(s)
        db.session.commit()
    return jsonify({'success': True})

# 9. ── Auth API ──
@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.json
    name, email, password = data.get('name'), data.get('email'), data.get('password')
    try:
        if not all([name, email, password]):
            return jsonify({'error': 'All fields are required'}), 400
        
        user = User.query.filter_by(email=email).first()
        deterministic_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, email))
        
        if user:
            if user.password_hash: return jsonify({'error': 'Email already registered'}), 400
            user.name, user.password_hash = name, generate_password_hash(password)
        else:
            user = User(
                id=deterministic_id, name=name, email=email,
                password_hash=generate_password_hash(password),
                is_pro=(email in PRO_EMAILS)
            )
            db.session.add(user)
        
        db.session.commit()
        trigger_database_sync()
        return jsonify({'token': create_token(user.id), 'user': {'id': user.id, 'name': user.name, 'email': user.email, 'is_pro': user.is_pro}})
    except Exception as e:
        logger.error(f"Signup error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/update_pro', methods=['POST'])
@token_required
def update_pro_status(user_id):
    try:
        data = request.json
        status = data.get('is_pro', False)
        user = db.session.get(User, user_id)
        if user:
            user.is_pro = status
            db.session.commit()
            trigger_database_sync()
            return jsonify({'success': True, 'is_pro': user.is_pro})
        return jsonify({'error': 'User not found'}), 404
    except Exception as e:
        logger.error(f"Update pro error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.json
        email, password = data.get('email'), data.get('password')
        user = User.query.filter_by(email=email).first()
        
        # AUTO-RECOVERY: If the DB was wiped but user knows their stuff, re-register them
        if not user:
            deterministic_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, email))
            user = User(
                id=deterministic_id, 
                name=email.split('@')[0], 
                email=email, 
                password_hash=generate_password_hash(password),
                is_pro=(email in PRO_EMAILS)
            )
            db.session.add(user)
            db.session.commit()
            trigger_database_sync()
            logger.info(f"Auto-recovered account for {email} with ID {user.id}")
        
        if not check_password_hash(user.password_hash, password):
            return jsonify({'error': 'Invalid password'}), 401
        
        if user.email in PRO_EMAILS and not user.is_pro:
            user.is_pro = True
            db.session.commit()

        return jsonify({'token': create_token(user.id), 'user': {'id': user.id, 'name': user.name, 'email': user.email, 'is_pro': user.is_pro}})
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/join', methods=['POST'])
def join_session():
    try:
        data = request.json
        name = data.get('name', 'Anonymous')
        email = data.get('email', f"anon_{uuid.uuid4().hex[:6]}@example.com")
        room_id = data.get('room_id')
        if room_id:
            room_id = str(room_id).strip()
        if not room_id:
            room_id = None

        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(id=str(uuid.uuid4()), name=name, email=email, is_pro=(email in PRO_EMAILS))
            db.session.add(user)
        
        if not room_id:
            room_id = str(uuid.uuid4())[:8]
            new_room = Room(id=room_id, name=f"{name}'s Room", owner_id=user.id)
            user.room_id, user.is_admin = room_id, True
            db.session.add(new_room)
        else:
            room = Room.query.get(room_id)
            if not room: return jsonify({'error': 'Room not found'}), 404
            user.room_id = room_id

        db.session.commit()
        trigger_database_sync()
        return jsonify({'token': create_token(user.id), 'room_id': room_id, 'user': {'id': user.id, 'name': user.name, 'email': user.email, 'is_admin': user.is_admin, 'is_pro': user.is_pro}})
    except Exception as e:
        logger.error(f"Join error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# 10. ── Room & Player API ──
@app.route('/api/room/<room_id>', methods=['GET'])
def get_room_state(room_id):
    room = Room.query.get(room_id.strip())
    if not room: return jsonify({'error': 'Room not found'}), 404
    
    songs = Song.query.filter_by(room_id=room_id).order_by(Song.position.asc(), Song.created_at.asc()).all()
    queue = [{ 'id': s.id, 'title': s.title, 'artist': s.artist, 'duration': s.duration, 'source': s.source, 'source_id': s.source_id, 'thumbnail': s.thumbnail, 'url': s.url, 'added_by': s.added_by_name, 'votes': s.votes } for s in songs]

    calc_time = room.playback_time
    if room.is_playing and room.last_updated_at:
        now_utc = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        last_upd = room.last_updated_at.replace(tzinfo=None)
        elapsed = (now_utc - last_upd).total_seconds()
        calc_time += elapsed

    return jsonify({'id': room.id, 'name': room.name, 'current_song_id': room.current_song_id, 'is_playing': room.is_playing, 'playback_time': calc_time, 'repeat_type': room.repeat_type, 'shuffle_mode': room.shuffle_mode, 'queue': queue})

@app.route('/api/room/<room_id>/upload', methods=['POST'])
def upload_file(room_id):
    file = request.files.get('file')
    if not file or file.filename == '': return jsonify({'error': 'Invalid file'}), 400
    
    if file.filename.endswith(('.mp3', '.wav')):
        filename = secure_filename(f"{uuid.uuid4()}_{file.filename}")
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        
        song = Song(
            id=str(uuid.uuid4()), 
            title=file.filename, 
            artist="Upload", 
            source='upload', 
            source_id=filename, 
            url=f"{request.host_url.rstrip('/')}/api/uploads/{filename}",
            added_by_name=request.form.get('user_name', 'Anonymous'), 
            room_id=room_id
        )
        db.session.add(song)
        
        room = Room.query.get(room_id)
        if room and not room.current_song_id:
            room.current_song_id, room.is_playing = song.id, True
        
        db.session.commit()
        socketio.emit('queue_updated', {'room_id': room_id}, room=room_id)
        return jsonify({
            'message': 'Uploaded', 
            'song': { 
                'id': song.id, 
                'title': song.title, 
                'artist': song.artist,
                'source': song.source,
                'source_id': song.source_id,
                'thumbnail': song.thumbnail,
                'url': song.url
            }
        })
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/api/room/<room_id>/add', methods=['POST'])
def add_to_room_api(room_id):
    data = request.json
    room = Room.query.get(room_id)
    if not room: return jsonify({'error': 'Room not found'}), 404

    last_song = Song.query.filter_by(room_id=room_id).order_by(Song.position.desc()).first()
    pos = (last_song.position + 1) if last_song else 0

    new_song = Song(
        id=str(uuid.uuid4()),
        room_id=room_id,
        title=data['title'],
        artist=data.get('artist', 'Unknown'),
        duration=data.get('duration', 0),
        source=data['source'],
        source_id=data['source_id'],
        thumbnail=data.get('thumbnail', ''),
        url=data.get('url', ''),
        added_by_name=data.get('added_by', 'Anonymous'),
        position=pos
    )
    db.session.add(new_song)
    
    if not room.current_song_id:
        room.current_song_id, room.is_playing = new_song.id, True
        room.playback_time = 0
        room.last_updated_at = datetime.datetime.now(datetime.timezone.utc)

    db.session.commit()
    socketio.emit('queue_updated', {'room_id': room_id}, room=room_id)
    socketio.emit('room_state_update', {'current_song_id': room.current_song_id}, room=room_id)
    return jsonify({'success': True, 'song_id': new_song.id})

@app.route('/api/room/<room_id>/add-bulk', methods=['POST'])
def add_bulk_to_room(room_id):
    data = request.json
    songs_data = data.get('songs', [])
    room = Room.query.get(room_id)
    if not room: return jsonify({'error': 'Room not found'}), 404

    last_song = Song.query.filter_by(room_id=room_id).order_by(Song.position.desc()).first()
    pos = (last_song.position + 1) if last_song else 0

    new_songs = []
    for s in songs_data:
        ns = Song(
            id=str(uuid.uuid4()),
            room_id=room_id,
            title=s['title'],
            artist=s.get('artist', 'Unknown'),
            duration=s.get('duration', 0),
            source=s['source'],
            source_id=s['source_id'],
            thumbnail=s.get('thumbnail', ''),
            added_by_name=data.get('added_by', 'Anonymous'),
            position=pos
        )
        db.session.add(ns)
        new_songs.append(ns)
        pos += 1
    
    if not room.current_song_id and new_songs:
        room.current_song_id, room.is_playing = new_songs[0].id, True
        room.playback_time = 0
        room.last_updated_at = datetime.datetime.now(datetime.timezone.utc)

    db.session.commit()
    socketio.emit('queue_updated', {'room_id': room_id}, room=room_id)
    socketio.emit('room_state_update', {'current_song_id': room.current_song_id}, room=room_id)
    return jsonify({'success': True, 'count': len(new_songs)})

@app.route('/api/room/<room_id>/queue/<song_id>', methods=['DELETE'])
def remove_from_room_queue(room_id, song_id):
    song = Song.query.filter_by(id=song_id, room_id=room_id).first()
    if not song: return jsonify({'error': 'Song not found'}), 404

    db.session.delete(song)
    room = Room.query.get(room_id)
    if room and room.current_song_id == song_id:
        # Move to next song
        next_song = Song.query.filter_by(room_id=room_id).order_by(Song.position.asc()).first()
        room.current_song_id = next_song.id if next_song else None
        room.playback_time = 0
        room.is_playing = bool(next_song)
    
    db.session.commit()
    socketio.emit('queue_updated', {'room_id': room_id}, room=room_id)
    socketio.emit('room_state_update', {'current_song_id': room.current_song_id}, room=room_id)
    return jsonify({'success': True})

@app.route('/api/room/<room_id>/reorder', methods=['POST'])
def reorder_room_queue(room_id):
    data = request.json
    song_id, direction = data.get('song_id'), data.get('direction')
    song = Song.query.filter_by(id=song_id, room_id=room_id).first()
    if not song: return jsonify({'error': 'Song not found'}), 404

    songs = Song.query.filter_by(room_id=room_id).order_by(Song.position.asc()).all()
    idx = next((i for i, s in enumerate(songs) if s.id == song_id), -1)
    
    if direction == 'up' and idx > 0:
        songs[idx].position, songs[idx-1].position = songs[idx-1].position, songs[idx].position
    elif direction == 'down' and idx < len(songs) - 1:
        songs[idx].position, songs[idx+1].position = songs[idx+1].position, songs[idx].position
    
    db.session.commit()
    socketio.emit('queue_updated', {'room_id': room_id}, room=room_id)
    return jsonify({'success': True})

# 11. ── WebSocket Events ──
active_users = {}

@socketio.on('join')
def on_join(data):
    room_id, user_id, user_name = data['room'], data.get('user_id'), data.get('user_name', 'Guest')
    join_room(room_id)
    if not user_id or user_id in ["undefined", "null"]: return

    if room_id not in active_users: active_users[room_id] = []
    if not any(u.get('id') == user_id for u in active_users[room_id]):
        active_users[room_id].append({'id': user_id, 'name': user_name})
    emit('user_list', active_users[room_id], room=room_id)

@socketio.on('leave')
def on_leave(data):
    room_id, user_id = data['room'], data.get('user_id')
    leave_room(room_id)
    if room_id in active_users:
        active_users[room_id] = [u for u in active_users[room_id] if u['id'] != user_id]
        emit('user_list', active_users[room_id], room=room_id)

last_skips = {}

@socketio.on('playback_control')
def handle_playback(data):
    import random, time
    room_id, curr_action, curr_value = data.get('room_id'), data.get('action'), data.get('value')
    if not room_id: return
    room = db.session.get(Room, room_id)
    if not room: return

    if room.is_playing and room.last_updated_at:
        now_utc = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        last_upd = room.last_updated_at.replace(tzinfo=None)
        room.playback_time += (now_utc - last_upd).total_seconds()
    
    room.last_updated_at = datetime.datetime.now(datetime.timezone.utc)

    if curr_action == 'play': room.is_playing = True
    elif curr_action == 'pause': room.is_playing = False
    elif curr_action == 'seek': room.playback_time = float(curr_value or 0)
    elif curr_action == 'set_repeat': room.repeat_type = int(curr_value or 0)
    elif curr_action == 'set_shuffle': room.shuffle_mode = bool(curr_value)
    elif curr_action in ('next', 'prev'):
        now = time.time()
        last_info = last_skips.get(room_id, (0, None))
        if curr_action == 'next' and last_info[1] == room.current_song_id and (now - last_info[0]) < 2.0: return
        last_skips[room_id] = (now, room.current_song_id)

        songs = Song.query.filter_by(room_id=room_id).order_by(Song.position.asc(), Song.created_at.asc()).all()
        if not songs: return
        current_idx = next((i for i, s in enumerate(songs) if s.id == room.current_song_id), -1)

        if curr_action == 'next':
            if room.repeat_type == 2: next_idx = current_idx
            elif room.shuffle_mode:
                cands = [i for i in range(len(songs)) if i != current_idx]
                next_idx = random.choice(cands) if cands else current_idx
            else:
                next_idx = current_idx + 1
                if next_idx >= len(songs):
                    if room.repeat_type == 1: next_idx = 0
                    else:
                        room.is_playing, room.current_song_id = False, None
                        db.session.commit()
                        emit('playback_update', {'action': 'stop'}, room=room_id)
                        return
        else: next_idx = max(0, current_idx - 1)

        if 0 <= next_idx < len(songs):
            room.current_song_id, room.playback_time, room.is_playing = songs[next_idx].id, 0, True

    db.session.commit()
    emit('playback_update', data, room=room_id, include_self=False)
    if curr_action in ('next', 'prev', 'set_repeat', 'set_shuffle'):
        s = db.session.get(Song, room.current_song_id) if room.current_song_id else None
        song_data = { 'id': s.id, 'title': s.title, 'artist': s.artist, 'source': s.source, 'source_id': s.source_id, 'thumbnail': s.thumbnail, 'room_id': room_id } if s else None
        emit('room_state_update', { 'current_song_id': room.current_song_id, 'current_song': song_data, 'repeat_type': room.repeat_type, 'shuffle_mode': room.shuffle_mode }, room=room_id, include_self=True)

@socketio.on('add_to_queue')
def add_to_queue(data):
    room_id, song_data = data['room_id'], data['song']
    # Calculate next position
    last_song = Song.query.filter_by(room_id=room_id).order_by(Song.position.desc()).first()
    pos = (last_song.position + 1) if last_song else 0

    new_song = Song(
        id=str(uuid.uuid4()), 
        room_id=room_id, 
        title=song_data['title'], 
        artist=song_data.get('artist', 'Unknown'), 
        duration=song_data.get('duration', 0), 
        source=song_data['source'], 
        source_id=song_data['source_id'], 
        thumbnail=song_data.get('thumbnail', ''), 
        added_by_name=song_data.get('added_by', 'Anonymous'),
        position=pos
    )
    db.session.add(new_song)
    room = Room.query.get(room_id)
    if room and not room.current_song_id:
        room.current_song_id, room.is_playing = new_song.id, True
    db.session.commit()
    emit('queue_updated', {'room_id': room_id}, room=room_id)
    emit('room_state_update', {'current_song_id': room.current_song_id if room else None}, room=room_id)

# 12. ── Main Entry ──
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    logger.info(f"Server starting on port {port} in THREADING mode...")
    socketio.run(app, host='0.0.0.0', port=port, debug=False, allow_unsafe_werkzeug=True)
