/**
 * HandTracker - Manages MediaPipe Hands detection and squeeze (fist) gesture recognition.
 *
 * A "squeeze" is detected when a hand transitions from open to closed fist.
 * Each hand can independently trigger pops at the fist position.
 */
class HandTracker {
    constructor() {
        this.hands = null;
        this.camera = null;
        this.videoElement = null;
        this.isReady = false;

        // Latest hand data
        this.landmarks = [];
        this.handStates = {};       // 'left' | 'right' -> { open, palm }
        this.squeezeCooldown = { left: 0, right: 0 };
        this.cooldownFrames = 15;

        // Callbacks
        this.onSqueeze = null;      // ({ x, y }) => void
        this.onHandsUpdate = null;  // (landmarks, squeezeInfo) => void
    }

    async init(videoElement) {
        this.videoElement = videoElement;

        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        this.hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 0,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.45
        });

        this.hands.onResults((results) => this._onResults(results));

        this.camera = new Camera(this.videoElement, {
            onFrame: async () => {
                if (this.hands) {
                    await this.hands.send({ image: this.videoElement });
                }
            },
            width: 1280,
            height: 720,
            facingMode: 'user'
        });

        await this.camera.start();
        this.isReady = true;
    }

    _onResults(results) {
        this.landmarks = results.multiHandLandmarks || [];
        const handedness = results.multiHandedness || [];

        const currentHands = {};

        for (let i = 0; i < this.landmarks.length; i++) {
            const hand = this.landmarks[i];
            const label = handedness[i]?.label;
            // MediaPipe labels are mirrored in selfie mode
            const side = label === 'Right' ? 'left' : 'right';

            const palm = this._getPalmCenter(hand);
            const open = this._isHandOpen(hand);
            currentHands[side] = { palm, open };
        }

        // Check for squeezes (open → fist transition)
        for (const side of ['left', 'right']) {
            if (this.squeezeCooldown[side] > 0) {
                this.squeezeCooldown[side]--;
            }

            const cur = currentHands[side];
            const prev = this.handStates[side];

            if (cur && prev) {
                if (prev.open && !cur.open && this.squeezeCooldown[side] <= 0) {
                    if (this.onSqueeze) {
                        this.onSqueeze({ x: cur.palm.x, y: cur.palm.y });
                    }
                    this.squeezeCooldown[side] = this.cooldownFrames;
                }
            }
        }

        // Save state for next frame
        this.handStates = {};
        for (const [side, data] of Object.entries(currentHands)) {
            this.handStates[side] = { open: data.open, palm: data.palm };
        }

        if (this.onHandsUpdate) {
            this.onHandsUpdate(this.landmarks, currentHands);
        }
    }

    /**
     * Determine if a hand is open (fingers extended) or closed (fist).
     * Compares each fingertip distance from wrist vs its MCP joint distance.
     * If most fingertips are closer to the wrist than their MCP, fingers are curled.
     */
    _isHandOpen(hand) {
        const wrist = hand[0];
        const fingertips = [8, 12, 16, 20]; // index, middle, ring, pinky tips
        const mcps = [5, 9, 13, 17];        // corresponding MCP joints

        let curled = 0;
        for (let i = 0; i < fingertips.length; i++) {
            const tipDist = this._getDistance(wrist, hand[fingertips[i]]);
            const mcpDist = this._getDistance(wrist, hand[mcps[i]]);
            if (tipDist < mcpDist * 1.15) {
                curled++;
            }
        }

        // 3+ curled fingers = fist
        return curled < 3;
    }

    _getPalmCenter(hand) {
        const indices = [0, 5, 9, 13, 17];
        let x = 0, y = 0;
        for (const idx of indices) {
            x += hand[idx].x;
            y += hand[idx].y;
        }
        return { x: x / indices.length, y: y / indices.length };
    }

    _getDistance(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    getHandCount() {
        return this.landmarks.length;
    }

    destroy() {
        if (this.camera) {
            this.camera.stop();
        }
        this.hands = null;
    }
}
