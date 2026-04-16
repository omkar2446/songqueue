import os
import uuid
import datetime
import jwt
import requests
import logging
import traceback
from functools import wraps

from flask import Flask, request, jsonify, send_from_directory, Response
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_sqlalchemy import SQLAlchemy
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
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///songqueue.db')
if app.config['SQLALCHEMY_DATABASE_URI'].startswith("postgres://"):
    # Fix for Render/Heroku postgres URLs
    app.config['SQLALCHEMY_DATABASE_URI'] = app.config['SQLALCHEMY_DATABASE_URI'].replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(os.getcwd(), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

db = SQLAlchemy(app)

# 4. ── SocketIO Setup (USING THREADING MODE FOR STABILITY) ──
# Threading mode is most compatible with standard Python libraries and avoids monkey patching.
socketio = SocketIO(
    app, 
    cors_allowed_origins="*", 
    async_mode='threading', 
    logger=True, 
    engineio_logger=True
)
CORS(app)

# 5. ── Models ──
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
    created_at = db.Column(db.DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

class Song(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    artist = db.Column(db.String(100))
    duration = db.Column(db.Integer)
    source = db.Column(db.String(20))
    source_id = db.Column(db.String(255))
    thumbnail = db.Column(db.String(500))
    added_by_name = db.Column(db.String(100))
    room_id = db.Column(db.String(36), db.ForeignKey('room.id'))
    votes = db.Column(db.Integer, default=0)
    position = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

with app.app_context():
    db.create_all()
    # Live Migration Helper (fixes 500 errors on existing Render DBs)
    from sqlalchemy import text
    with db.engine.connect() as conn:
        for stmt in [
            "ALTER TABLE user ADD COLUMN is_pro BOOLEAN DEFAULT 0",
            "ALTER TABLE user ADD COLUMN is_admin BOOLEAN DEFAULT 0",
            "ALTER TABLE user ADD COLUMN room_id VARCHAR(36)",
            "ALTER TABLE user ADD COLUMN password_hash VARCHAR(255)",
            "ALTER TABLE room ADD COLUMN name VARCHAR(100)",
            "ALTER TABLE room ADD COLUMN owner_id VARCHAR(36)",
            "ALTER TABLE room ADD COLUMN last_updated_at DATETIME",
            "ALTER TABLE room ADD COLUMN repeat_type INTEGER DEFAULT 0",
            "ALTER TABLE room ADD COLUMN shuffle_mode BOOLEAN DEFAULT 0",
            "ALTER TABLE song ADD COLUMN position INTEGER DEFAULT 0",
            "ALTER TABLE song ADD COLUMN votes INTEGER DEFAULT 0",
            "ALTER TABLE song ADD COLUMN added_by_name VARCHAR(100)"
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
                logger.info(f"Migration Success: {stmt}")
            except Exception: pass 

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
@app.route('/')
def health_check():
    return jsonify({
        "status": "online",
        "service": "SongQueue API",
        "runtime": "threading",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    })

@app.route('/api/uploads/<path:filename>')
def serve_upload(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/yt/stream/<video_id>')
def stream_yt(video_id):
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'no_warnings': True,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            url = info['url']
            
            headers = {}
            if 'Range' in request.headers:
                headers['Range'] = request.headers['Range']

            r = requests.get(url, headers=headers, stream=True, timeout=10)
            
            def generate():
                for chunk in r.iter_content(chunk_size=1024*64):
                    yield chunk

            resp = Response(generate(), status=r.status_code)
            for k, v in r.headers.items():
                if k.lower() in ['content-type', 'content-length', 'accept-ranges', 'content-range']:
                    resp.headers[k] = v
            return resp
    except Exception as e:
        logger.error(f"YouTube Stream Error: {str(e)}")
        return jsonify({'error': 'Failed to stream YouTube audio'}), 500

# 8. ── Playlists API ──
@app.route('/api/playlists', methods=['GET'])
@token_required
def get_playlists(user_id):
    playlists = Playlist.query.filter_by(user_id=user_id).all()
    return jsonify([{
        'id': p.id,
        'name': p.name,
        'count': PlaylistSong.query.filter_by(playlist_id=p.id).count()
    } for p in playlists])

@app.route('/api/playlists', methods=['POST'])
@token_required
def create_playlist(user_id):
    data = request.json
    p = Playlist(id=str(uuid.uuid4()), name=data['name'], user_id=user_id)
    db.session.add(p)
    db.session.commit()
    return jsonify({'id': p.id, 'name': p.name})

@app.route('/api/playlists/<pid>', methods=['GET'])
@token_required
def get_playlist_songs(user_id, pid):
    p = Playlist.query.filter_by(id=pid, user_id=user_id).first()
    if not p: return jsonify({'error': 'Not found'}), 404
    songs = PlaylistSong.query.filter_by(playlist_id=pid).all()
    return jsonify({
        'name': p.name,
        'songs': [{
            'id': s.id, 'title': s.title, 'artist': s.artist,
            'source': s.source, 'source_id': s.source_id,
            'thumbnail': s.thumbnail, 'duration': s.duration
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
        title=d['title'], artist=d.get('artist'),
        duration=d.get('duration'), source=d['source'],
        source_id=d['source_id'], thumbnail=d.get('thumbnail')
    )
    db.session.add(s)
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
        if user:
            if user.password_hash: return jsonify({'error': 'Email already registered'}), 400
            user.name, user.password_hash = name, generate_password_hash(password)
        else:
            user = User(
                id=str(uuid.uuid4()), name=name, email=email,
                password_hash=generate_password_hash(password),
                is_pro=(email in PRO_EMAILS)
            )
            db.session.add(user)
        
        db.session.commit()
        return jsonify({'token': create_token(user.id), 'user': {'id': user.id, 'name': user.name, 'email': user.email, 'is_pro': user.is_pro}})
    except Exception as e:
        logger.error(f"Signup error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.json
        email, password = data.get('email'), data.get('password')
        user = User.query.filter_by(email=email).first()
        if not user or not check_password_hash(user.password_hash, password):
            return jsonify({'error': 'Invalid email or password'}), 401
        
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
        room_id = data.get('room_id', '').strip() or None

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
        return jsonify({'token': create_token(user.id), 'room_id': room_id, 'user': {'id': user.id, 'name': user.name, 'is_admin': user.is_admin, 'is_pro': user.is_pro}})
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
    queue = [{ 'id': s.id, 'title': s.title, 'artist': s.artist, 'duration': s.duration, 'source': s.source, 'source_id': s.source_id, 'thumbnail': s.thumbnail, 'added_by': s.added_by_name, 'votes': s.votes } for s in songs]

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
        
        song = Song(id=str(uuid.uuid4()), title=file.filename, artist="Upload", source='upload', source_id=filename, added_by_name=request.form.get('user_name', 'Anonymous'), room_id=room_id)
        db.session.add(song)
        
        room = Room.query.get(room_id)
        if room and not room.current_song_id:
            room.current_song_id, room.is_playing = song.id, True
        
        db.session.commit()
        socketio.emit('queue_updated', {'room_id': room_id}, room=room_id)
        return jsonify({'message': 'Uploaded', 'song': { 'id': song.id, 'title': song.title, 'source': 'upload' }})
    return jsonify({'error': 'Invalid file type'}), 400

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
        song_data = { 'id': s.id, 'title': s.title, 'artist': s.artist, 'source': s.source, 'source_id': s.source_id, 'thumbnail': s.thumbnail } if s else None
        emit('room_state_update', { 'current_song_id': room.current_song_id, 'current_song': song_data, 'repeat_type': room.repeat_type, 'shuffle_mode': room.shuffle_mode }, room=room_id)

@socketio.on('add_to_queue')
def add_to_queue(data):
    room_id, song_data = data['room_id'], data['song']
    new_song = Song(id=str(uuid.uuid4()), room_id=room_id, title=song_data['title'], artist=song_data.get('artist', 'Unknown'), duration=song_data.get('duration', 0), source=song_data['source'], source_id=song_data['source_id'], thumbnail=song_data.get('thumbnail', ''), added_by_name=song_data.get('added_by', 'Anonymous'))
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
