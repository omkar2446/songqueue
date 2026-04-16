import eventlet
eventlet.monkey_patch()

import os
import uuid
import datetime
import jwt
import requests
import logging
import traceback
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_socketio import SocketIO, emit, join_room, leave_room, rooms
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.utils import secure_filename

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# ── PRO account (only this user gets GO PRO access) ──
PRO_OWNER_EMAIL = 'otambe655@gmail.com'

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'supersecretkey-change-this')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///songqueue.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(os.getcwd(), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024 # 50MB

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet', logger=True, engineio_logger=True)
CORS(app)

@app.route('/')
def health_check():
    return jsonify({
        "status": "online",
        "service": "SongQueue API",
        "timestamp": datetime.datetime.utcnow().isoformat()
    })

# Ensure tables exist
with app.app_context():
    db.create_all()

# --- Models ---
class Room(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    owner_id = db.Column(db.String(36), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    current_song_id = db.Column(db.String(36), nullable=True)
    is_playing = db.Column(db.Boolean, default=False)
    playback_time = db.Column(db.Float, default=0.0)
    repeat_mode = db.Column(db.Boolean, default=False)
    repeat_type = db.Column(db.Integer, default=0)
    shuffle_mode = db.Column(db.Boolean, default=False)
    last_updated_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

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
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

class PlaylistSong(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    playlist_id = db.Column(db.String(36), db.ForeignKey('playlist.id'))
    title = db.Column(db.String(200), nullable=False)
    artist = db.Column(db.String(100))
    duration = db.Column(db.Integer)
    source = db.Column(db.String(20))
    source_id = db.Column(db.String(255))
    thumbnail = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

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
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

with app.app_context():
    db.create_all()
    from sqlalchemy import text
    with db.engine.connect() as conn:
        for stmt in [
            "ALTER TABLE user ADD COLUMN password_hash VARCHAR(255)",
            "ALTER TABLE room ADD COLUMN repeat_type INTEGER DEFAULT 0",
            "ALTER TABLE room ADD COLUMN shuffle_mode BOOLEAN DEFAULT 0",
            "ALTER TABLE song ADD COLUMN position INTEGER DEFAULT 0",
            "ALTER TABLE user ADD COLUMN is_pro BOOLEAN DEFAULT 0",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception: pass

# --- Auth Helper ---
from werkzeug.security import generate_password_hash, check_password_hash

def create_token(user_id):
    payload = {
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7),
        'iat': datetime.datetime.utcnow(),
        'sub': user_id
    }
    return jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')

# --- Auth Decorator ---
from functools import wraps
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
@app.route('/')
def home():
    return "Song Queue API is running 🚀"
# --- Routes ---
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
    # Ensure playlist belongs to user
    p = Playlist.query.filter_by(id=pid, user_id=user_id).first()
    if not p: return jsonify({'error': 'Not found'}), 404
    s = PlaylistSong.query.filter_by(id=sid, playlist_id=pid).first()
    if s:
        db.session.delete(s)
        db.session.commit()
    return jsonify({'success': True})

@app.route('/api/playlists/<pid>', methods=['DELETE'])
@token_required
def delete_playlist(user_id, pid):
    p = Playlist.query.filter_by(id=pid, user_id=user_id).first()
    if not p: return jsonify({'error': 'Not found'}), 404
    PlaylistSong.query.filter_by(playlist_id=pid).delete()
    db.session.delete(p)
    db.session.commit()
    return jsonify({'success': True})
@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.json
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')

    if not all([name, email, password]):
        return jsonify({'error': 'All fields are required'}), 400
    
    user = User.query.filter_by(email=email).first()
    if user:
        if user.password_hash:
            return jsonify({'error': 'Email already registered'}), 400
        # Claim existing anonymous account
        user.name = name
        user.password_hash = generate_password_hash(password)
    else:
        user_id = str(uuid.uuid4())
        user = User(
            id=user_id,
            name=name,
            email=email,
            password_hash=generate_password_hash(password)
        )
        db.session.add(user)
    
    db.session.commit()

    token = create_token(user.id)
    return jsonify({
        'token': token,
        'user': {'id': user.id, 'name': user.name, 'email': user.email, 'is_pro': user.is_pro}
    })

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({'error': 'Invalid email or password'}), 401
    
    # Auto-grant PRO to the owner account on every login
    if user.email == PRO_OWNER_EMAIL and not user.is_pro:
        user.is_pro = True
        db.session.commit()

    token = create_token(user.id)
    return jsonify({
        'token': token,
        'user': {'id': user.id, 'name': user.name, 'email': user.email, 'is_pro': user.is_pro}
    })

@app.route('/api/auth/update_pro', methods=['POST'])
@token_required
def update_pro(user_id):
    user = User.query.get(user_id)
    if not user or user.email != PRO_OWNER_EMAIL:
        return jsonify({'error': 'PRO access is restricted to authorized accounts.'}), 403
    data = request.json
    is_pro = data.get('is_pro', False)
    user.is_pro = is_pro
    db.session.commit()
    return jsonify({'success': True, 'is_pro': user.is_pro})

@app.route('/api/auth/join', methods=['POST'])
def join_session():
    data = request.json
    name = data.get('name')
    email = data.get('email', f"anon_{uuid.uuid4().hex[:6]}@example.com")
    room_id = data.get('room_id', '').strip() or None

    # Try to find user by email or create a placeholder
    user = User.query.filter_by(email=email).first()
    if not user:
        user_id = str(uuid.uuid4())
        user = User(id=user_id, name=name, email=email)
        # Auto-grant PRO to owner
        if email == PRO_OWNER_EMAIL:
            user.is_pro = True
        db.session.add(user)
    else:
        user_id = user.id

    if not room_id:
        room_id = str(uuid.uuid4())[:8]
        new_room = Room(id=room_id, name=f"{name}'s Room", owner_id=user_id)
        user.room_id = room_id
        user.is_admin = True
        db.session.add(new_room)
    else:
        room = Room.query.get(room_id)
        if not room: return jsonify({'error': 'Room not found'}), 404
        user.room_id = room_id

    db.session.commit()
    token = create_token(user_id)
    return jsonify({
        'token': token,
        'user': {'id': user_id, 'name': user.name, 'is_admin': user.is_admin, 'is_pro': user.is_pro},
        'room_id': room_id
    })

@app.route('/api/room/<room_id>', methods=['GET'])
def get_room_state(room_id):
    room_id = room_id.strip()
    room = Room.query.get(room_id)
    if not room:
        return jsonify({'error': 'Room not found'}), 404
    
    songs = Song.query.filter_by(room_id=room_id).order_by(Song.created_at.asc()).all()
    queue = [{
        'id': s.id,
        'title': s.title,
        'artist': s.artist,
        'duration': s.duration,
        'source': s.source,
        'source_id': s.source_id,
        'thumbnail': s.thumbnail,
        'added_by': s.added_by_name,
        'votes': s.votes
    } for s in songs]

    return jsonify({
        'id': room.id,
        'name': room.name,
        'current_song_id': room.current_song_id,
        'is_playing': room.is_playing,
        'playback_time': room.playback_time,
        'repeat_mode': room.repeat_mode,
        'repeat_type': room.repeat_type,
        'shuffle_mode': room.shuffle_mode,
        'queue': queue
    })

@app.route('/api/room/<room_id>/upload', methods=['POST'])
def upload_file(room_id):
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and (file.filename.endswith('.mp3') or file.filename.endswith('.wav')):
        filename = secure_filename(f"{uuid.uuid4()}_{file.filename}")
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        
        # Add to DB
        song = Song(
            id=str(uuid.uuid4()),
            title=file.filename,
            artist="Unknown Upload",
            duration=0, # Hard to get without lib, could be updated on frontend
            source='file',
            source_id=filename,
            added_by_name=request.form.get('user_name', 'Anonymous'),
            room_id=room_id
        )
        db.session.add(song)
        
        # Auto-play if nothing is playing
        room = Room.query.get(room_id)
        if room and not room.current_song_id:
            room.current_song_id = song.id
            room.is_playing = True
            
        db.session.commit()
        
        # Notify room
        socketio.emit('queue_updated', {'room_id': room_id}, room=room_id)
        socketio.emit('room_state_update', {'current_song_id': room.current_song_id if room else None}, room=room_id)
        
        return jsonify({
            'message': 'File uploaded successfully',
            'song': {
                'id': song.id,
                'title': song.title,
                'artist': song.artist,
                'source': song.source,
                'source_id': song.source_id,
                'thumbnail': '',
                'duration': song.duration
            }
        })
    
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/api/room/<room_id>/queue/<song_id>', methods=['DELETE'])
def remove_song(room_id, song_id):
    song = Song.query.filter_by(id=song_id, room_id=room_id).first()
    if not song:
        return jsonify({'error': 'Song not found'}), 404
    room = Room.query.get(room_id)
    # If removing the currently playing song, advance to next
    if room and room.current_song_id == song_id:
        songs = Song.query.filter_by(room_id=room_id).order_by(Song.position.asc(), Song.created_at.asc()).all()
        idx = next((i for i, s in enumerate(songs) if s.id == song_id), -1)
        db.session.delete(song)
        remaining = [s for s in songs if s.id != song_id]
        if remaining:
            next_song = remaining[min(idx, len(remaining) - 1)]
            room.current_song_id = next_song.id
            room.playback_time = 0
        else:
            room.current_song_id = None
            room.is_playing = False
    else:
        db.session.delete(song)
    db.session.commit()
    socketio.emit('queue_updated', {'room_id': room_id}, room=room_id)
    socketio.emit('room_state_update', {'current_song_id': room.current_song_id if room else None}, room=room_id)
    return jsonify({'message': 'Song removed'})

@app.route('/api/room/<room_id>/reorder', methods=['POST'])
def reorder_queue(room_id):
    data = request.json
    song_id   = data.get('song_id')
    direction = data.get('direction')  # 'up' or 'down'
    songs = Song.query.filter_by(room_id=room_id).order_by(Song.position.asc(), Song.created_at.asc()).all()
    idx = next((i for i, s in enumerate(songs) if s.id == song_id), -1)
    if idx == -1:
        return jsonify({'error': 'Song not found'}), 404
    swap_idx = idx - 1 if direction == 'up' else idx + 1
    if swap_idx < 0 or swap_idx >= len(songs):
        return jsonify({'message': 'Already at boundary'}), 200
    # Ensure positions are sequential
    for i, s in enumerate(songs):
        s.position = i
    songs[idx].position, songs[swap_idx].position = songs[swap_idx].position, songs[idx].position
    db.session.commit()
    socketio.emit('queue_updated', {'room_id': room_id}, room=room_id)
    return jsonify({'message': 'Reordered'})

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    response = send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Range'
    response.headers['Access-Control-Expose-Headers'] = 'Content-Length, Content-Range'
    return response

# --- WebSocket Events ---
active_users = {} # room_id -> [user_data]

@socketio.on('join')
def on_join(data):
    room_id = data['room']
    user_id = data.get('user_id')
    user_name = data.get('user_name', 'Guest')
    
    join_room(room_id)
    
    # Safety check for valid user_id
    if not user_id or user_id == "undefined" or user_id == "null":
        print(f"WARNING: Rejected join with invalid user_id: {user_id}")
        return

    if room_id not in active_users:
        active_users[room_id] = []
    
    # Check if user already in list (avoid duplicates with empty/bad IDs)
    if not any(u.get('id') == user_id for u in active_users[room_id]):
        active_users[room_id].append({'id': user_id, 'name': user_name})
    
    emit('user_list', active_users[room_id], room=room_id)
    print(f"User {user_name} joined room: {room_id}")

@socketio.on('leave')
def on_leave(data):
    room_id = data['room']
    user_id = data.get('user_id')
    leave_room(room_id)
    
    if room_id in active_users:
        active_users[room_id] = [u for u in active_users[room_id] if u['id'] != user_id]
        emit('user_list', active_users[room_id], room=room_id)

@socketio.on('disconnect')
def on_disconnect():
    # Complex to track without session mapping, for now we rely on manual leave
    # or a periodic cleanup
    pass

# Global to track skip timing (RoomID -> (Timestamp, SongID))
last_skips = {}

@socketio.on('playback_control')
def handle_playback(data):
    import random
    import datetime
    import time
    room_id = data.get('room_id')
    curr_action = data.get('action')
    curr_value = data.get('value')
    
    if not room_id: return
    room = db.session.get(Room, room_id)
    if not room: return

    def get_room_songs():
        return Song.query.filter_by(room_id=room_id).order_by(Song.position.asc(), Song.created_at.asc()).all()

    if curr_action == 'play':
        room.is_playing = True
    elif curr_action == 'pause':
        room.is_playing = False
    elif curr_action == 'seek':
        room.playback_time = float(curr_value or 0)
    elif curr_action == 'set_repeat':
        room.repeat_type = int(curr_value or 0)
        room.repeat_mode = room.repeat_type > 0
    elif curr_action == 'set_shuffle':
        room.shuffle_mode = bool(curr_value)
    elif curr_action in ('next', 'prev'):
        # Protection against duplicate skips from multiple clients finishing at once
        now = time.time()
        last_info = last_skips.get(room_id, (0, None))
        
        if curr_action == 'next' and last_info[1] == room.current_song_id and (now - last_info[0]) < 2.0:
            return # Ignore duplicate next
            
        last_skips[room_id] = (now, room.current_song_id)

        songs = get_room_songs()
        if not songs: return
        
        current_idx = next((i for i, s in enumerate(songs) if s.id == room.current_song_id), -1)

        if curr_action == 'next':
            if room.repeat_type == 2:           # repeat one
                next_idx = current_idx
            elif room.shuffle_mode:
                candidates = [i for i in range(len(songs)) if i != current_idx]
                next_idx = random.choice(candidates) if candidates else current_idx
            else:
                next_idx = current_idx + 1
                if next_idx >= len(songs):
                    if room.repeat_type == 1:   # repeat all
                        next_idx = 0
                    else:
                        room.is_playing = False
                        room.current_song_id = None
                        db.session.commit()
                        emit('playback_update', {'action': 'stop'}, room=room_id)
                        emit('room_state_update', {'current_song_id': None}, room=room_id)
                        return
        else:  # prev
            next_idx = max(0, current_idx - 1)

        if 0 <= next_idx < len(songs):
            room.current_song_id = songs[next_idx].id
            room.playback_time   = 0
            room.is_playing      = True

    room.last_updated_at = datetime.datetime.now(datetime.UTC)
    db.session.commit()

    emit('playback_update', data, room=room_id, include_self=False)
    if curr_action in ('next', 'prev', 'set_repeat', 'set_shuffle'):
        current_song = None
        if room.current_song_id:
            s = db.session.get(Song, room.current_song_id)
            if s:
                current_song = {
                    'id': s.id, 'title': s.title, 'artist': s.artist,
                    'duration': s.duration, 'source': s.source,
                    'source_id': s.source_id, 'thumbnail': s.thumbnail,
                    'added_by': s.added_by_name, 'votes': s.votes
                }
        
        emit('room_state_update', {
            'current_song_id': room.current_song_id,
            'current_song': current_song,
            'repeat_type':  room.repeat_type,
            'shuffle_mode': room.shuffle_mode
        }, room=room_id)
    

@socketio.on('add_to_queue')
def add_to_queue(data):
    # data: { room_id, song: {title, artist, duration, source, source_id, thumbnail, added_by} }
    room_id = data['room_id']
    song_data = data['song']
    
    new_song = Song(
        id=str(uuid.uuid4()),
        room_id=room_id,
        title=song_data['title'],
        artist=song_data.get('artist', 'Unknown'),
        duration=song_data.get('duration', 0),
        source=song_data['source'],
        source_id=song_data['source_id'],
        thumbnail=song_data.get('thumbnail', ''),
        added_by_name=song_data.get('added_by', 'Anonymous')
    )
    db.session.add(new_song)
    
    # Auto-play if nothing is playing
    room = Room.query.get(room_id)
    if room and not room.current_song_id:
        room.current_song_id = new_song.id
        room.is_playing = True
        
    db.session.commit()
    
    emit('queue_updated', {'room_id': room_id}, room=room_id)
    emit('room_state_update', {'current_song_id': room.current_song_id if room else None}, room=room_id)

@socketio.on('vote')
def handle_vote(data):
    # data: { room_id, song_id, value: 1 or -1 }
    room_id = data['room_id']
    song_id = data['song_id']
    value = data['value']
    
    song = Song.query.get(song_id)
    if song:
        song.votes += value
        db.session.commit()
        emit('queue_updated', {'room_id': room_id}, room=room_id)

@socketio.on('transfer_admin')
def handle_transfer_admin(data):
    room_id = data['room_id']
    target_user_id = data['target_user_id']
    
    # Remove admin from all current admins in room
    current_admins = User.query.filter_by(room_id=room_id, is_admin=True).all()
    for u in current_admins:
        u.is_admin = False
    
    # Grant admin to target
    target = User.query.get(target_user_id)
    if target and target.room_id == room_id:
        target.is_admin = True
        db.session.commit()
        emit('admin_transferred', {'new_admin_id': target_user_id, 'new_admin_name': target.name}, room=room_id)
        print(f"Admin transferred to {target.name} in room {room_id}")

# --- Music Integration Service ---
YOUTUBE_API_KEY = os.getenv('YOUTUBE_API_KEY')

@app.route('/api/search/youtube', methods=['GET'])
def search_youtube():
    query = request.args.get('q')
    if not YOUTUBE_API_KEY or YOUTUBE_API_KEY == 'YOUR_YOUTUBE_API_KEY':
        return jsonify([]) # Return empty instead of 500
    
    try:
        url = f"https://www.googleapis.com/youtube/v3/search?part=snippet&q={query}&type=video&key={YOUTUBE_API_KEY}&maxResults=10"
        res = requests.get(url)
        data = res.json()
        
        results = []
        for item in data.get('items', []):
            results.append({
                'source_id': item['id']['videoId'],
                'title': item['snippet']['title'],
                'artist': item['snippet']['channelTitle'],
                'thumbnail': item['snippet']['thumbnails']['high']['url'],
                'source': 'youtube'
            })
        
        return jsonify(results)
    except:
        return jsonify([])

@app.route('/api/room/<room_id>/add', methods=['POST'])
def add_song(room_id):
    room_id = room_id.strip()
    room = Room.query.get(room_id)
    if not room:
        return jsonify({'error': 'Room not found'}), 404

    data = request.json
    user_name = data.get('added_by', 'Anonymous')
    
    song = Song(
        id=str(uuid.uuid4()),
        room_id=room_id,
        title=data['title'],
        artist=data.get('artist', 'Unknown'),
        duration=data.get('duration', 0),
        source=data['source'],
        source_id=data['source_id'],
        thumbnail=data.get('thumbnail', ''),
        added_by_name=user_name
    )
    db.session.add(song)
    
    # Auto-play if nothing is playing
    room = Room.query.get(room_id)
    if room and not room.current_song_id:
        room.current_song_id = song.id
        room.is_playing = True
    
    db.session.commit()
    
    socketio.emit('queue_updated', {'room_id': room_id}, room=room_id)
    socketio.emit('room_state_update', {'current_song_id': room.current_song_id if room else None}, room=room_id)
    return jsonify({'message': 'Song added to queue'})


# --- Server Environment ---
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    logger.info(f"Starting server on port {port}...")
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
