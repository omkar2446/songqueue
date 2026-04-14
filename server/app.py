import os
import uuid
import datetime
import jwt
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room, rooms
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.utils import secure_filename

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'supersecretkey-change-this')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///songqueue.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(os.getcwd(), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024 # 50MB

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')
CORS(app)

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
        'user': {'id': user.id, 'name': user.name, 'email': user.email}
    })

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({'error': 'Invalid email or password'}), 401
    
    token = create_token(user.id)
    return jsonify({
        'token': token,
        'user': {'id': user.id, 'name': user.name, 'email': user.email}
    })

@app.route('/api/auth/join', methods=['POST'])
def join_session():
    data = request.json
    name = data.get('name')
    email = data.get('email', f"anon_{uuid.uuid4().hex[:6]}@example.com")
    room_id = data.get('room_id')

    # Try to find user by email or create a placeholder
    user = User.query.filter_by(email=email).first()
    if not user:
        user_id = str(uuid.uuid4())
        user = User(id=user_id, name=name, email=email)
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
        'user': {'id': user_id, 'name': user.name, 'is_admin': user.is_admin},
        'room_id': room_id
    })

@app.route('/api/room/<room_id>', methods=['GET'])
def get_room_state(room_id):
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
    return response

# --- WebSocket Events ---
active_users = {} # room_id -> [user_data]

@socketio.on('join')
def on_join(data):
    room_id = data['room']
    user_id = data.get('user_id')
    user_name = data.get('user_name', 'Guest')
    
    join_room(room_id)
    
    if room_id not in active_users:
        active_users[room_id] = []
    
    # Add if not already there
    if not any(u['id'] == user_id for u in active_users[room_id]):
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
    
    # Pre-resolve next song's URL in background
    if curr_action in ('play', 'next', 'prev', 'seek'):
        def prefetch_next():
            with app.app_context():
                songs = Song.query.filter_by(room_id=room_id).order_by(Song.position.asc(), Song.created_at.asc()).all()
                if not songs: return
                curr_idx = next((i for i, s in enumerate(songs) if s.id == room.current_song_id), -1)
                next_idx = (curr_idx + 1) if curr_idx != -1 else 0
                if next_idx < len(songs):
                    target = songs[next_idx]
                    if target.source == 'youtube':
                        v_id = target.source_id
                        if v_id not in url_cache:
                            print(f"Prefetching YouTube URL for: {v_id}")
                            import yt_dlp
                            try:
                                with yt_dlp.YoutubeDL({'format': 'bestaudio/best', 'quiet': True}) as ydl:
                                    info = ydl.extract_info(f"https://www.youtube.com/watch?v={v_id}", download=False)
                                    url_cache[v_id] = {'url': info.get('url'), 'expires': time.time() + 7200}
                                    print(f"Prefetched: {v_id}")
                            except Exception as e:
                                print(f"Prefetch error: {e}")
        
        from threading import Thread
        Thread(target=prefetch_next).start()

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


# --- YouTube Audio Stream Proxy ---
url_cache = {} # video_id -> {url: str, expires: timestamp}

@app.route('/api/yt/stream/<video_id>')
def stream_youtube(video_id):
    """
    Proxy the YouTube audio stream so it can be used with a standard <audio> tag
    and connected to the Web Audio API (Equalizer).
    """
    import yt_dlp
    import time
    from flask import Response, stream_with_context

    # Check cache first (URLs typically last 6 hours, we'll cache for 2)
    now = time.time()
    cache_hit = url_cache.get(video_id)
    if cache_hit and cache_hit['expires'] > now:
        audio_url = cache_hit['url']
    else:
        video_url = f"https://www.youtube.com/watch?v={video_id}"
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
                audio_url = info.get('url')
                
                if not audio_url:
                    return "Could not extract audio URL", 404

                # Cache it
                url_cache[video_id] = {
                    'url': audio_url,
                    'expires': now + (2 * 3600)
                }
        except Exception as e:
            print(f"Proxy extraction error: {e}")
            return str(e), 500

    try:
        # Forward Range headers from client to YouTube for seeking support
        headers = {}
        range_header = request.headers.get('Range')
        if range_header:
            headers['Range'] = range_header

        # Stream the audio data from YouTube through our server
        # This bypasses CORS and allows it to be used in MediaElementSource
        req = requests.get(audio_url, stream=True, timeout=30, headers=headers)
        
        def generate():
            for chunk in req.iter_content(chunk_size=4096):
                yield chunk

        resp = Response(
            stream_with_context(generate()),
            content_type=req.headers.get('content-type', 'audio/mpeg'),
            status=req.status_code
        )
        
        # Pass through seeking-related headers
        if 'Content-Range' in req.headers:
            resp.headers['Content-Range'] = req.headers['Content-Range']
        if 'Content-Length' in req.headers:
            resp.headers['Content-Length'] = req.headers['Content-Length']
        resp.headers['Accept-Ranges'] = 'bytes'
        resp.headers['Access-Control-Allow-Origin'] = '*'
        
        return resp
            
    except Exception as e:
        print(f"Proxy streaming error: {e}")
        return str(e), 500

# --- Spotify -> YouTube Full Playback Resolver ---
@app.route('/api/spotify/resolve', methods=['POST'])
def resolve_spotify():
    """
    Accept a Spotify URL, fetch track name via oEmbed,
    search YouTube via yt-dlp, and return a YouTube video ID.
    Handles track, album, and playlist detection.
    """
    data = request.json or {}
    spotify_url = data.get('url', '')

    if not spotify_url or 'spotify.com' not in spotify_url:
        return jsonify({'error': 'Invalid Spotify URL'}), 400

    # Handle albums/playlists by letting the user know or processing the first item
    is_album = '/album/' in spotify_url
    is_playlist = '/playlist/' in spotify_url

    # Step 1: Fetch track info from Spotify oEmbed (free, no auth)
    try:
        oembed_resp = requests.get(
            'https://open.spotify.com/oembed',
            params={'url': spotify_url},
            timeout=10
        )
        oembed_data = oembed_resp.json()
        
        # If it's an album/playlist, oEmbed usually returns the title of the collection
        title = oembed_data.get('title', '')
        author = oembed_data.get('author_name', '')
        thumbnail = oembed_data.get('thumbnail_url', '')
        
        # For albums, we search for the album title + artist
        search_term = f"{title} {author}" if author else title
    except Exception as e:
        print(f"Spotify oEmbed error: {e}")
        return jsonify({'error': 'Could not fetch Spotify info'}), 500

    if not title:
        return jsonify({'error': 'Could not extract info from Spotify link'}), 400

    # Step 2: Use yt-dlp to search YouTube
    try:
        import yt_dlp
        
        search_query = f"ytsearch1:{search_term} official audio"
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'format': 'bestaudio/best',
            'noplaylist': True,
            'skip_download': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(search_query, download=False)

        entries = info.get('entries', [info]) if info else []
        if not entries:
            return jsonify({'error': 'No YouTube match found'}), 404

        entry = entries[0]
        video_id = entry.get('id', '')
        
        return jsonify({
            'success': True,
            'youtube_id':  video_id,
            'title':       entry.get('title', title),
            'artist':      entry.get('uploader', author or 'YouTube'),
            'thumbnail':   entry.get('thumbnail', thumbnail),
            'duration':    entry.get('duration', 0),
            '_is_collection': is_album or is_playlist
        })

    except Exception as e:
        print(f"yt-dlp error: {e}")
        return jsonify({'error': f'Search failed: {str(e)}'}), 500

if __name__ == '__main__':
    socketio.run(app, debug=True, port=5000)
