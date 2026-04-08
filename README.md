# AR Balloon Pop

A multiplayer AR balloon popping game that runs in your browser. Use your webcam and clap your hands together to pop falling balloons!

**[Play Now](https://cristi-boboc.github.io/ar-game/)**

## How to Play

1. **Allow camera access** - The game uses your webcam as the AR background
2. **Host or Join** - Host a new game to get a 5-digit invite code, or join a friend's game with their code
3. **Show both hands** - The game tracks your hands using MediaPipe
4. **Clap to pop!** - Bring your palms together to pop nearby balloons
5. **Score the most** - The player who pops the most balloons in 60 seconds wins!

## Features

- **AR Hand Tracking** - Real-time hand skeleton overlay on your camera feed via MediaPipe Hands
- **Multiplayer** - Peer-to-peer sessions using PeerJS (WebRTC) with 5-digit room codes
- **No Server Needed** - Fully static, hosted on GitHub Pages
- **Clap Detection** - Balloons pop when both palms come together near a balloon
- **Increasing Difficulty** - Balloon spawn rate ramps up over the 60-second round
- **Live Scoreboard** - Scores sync across all players in real time

## Tech Stack

| Technology | Purpose |
|---|---|
| [MediaPipe Hands](https://google.github.io/mediapipe/solutions/hands.html) | Real-time hand landmark detection |
| [PeerJS](https://peerjs.com/) | WebRTC peer-to-peer multiplayer |
| HTML5 Canvas | Balloon rendering and effects |
| Vanilla JS | No frameworks, no build step |

## Running Locally

Just serve the project folder with any static file server:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx serve .
```

Then open `http://localhost:8000` in your browser (HTTPS or localhost required for camera access).
