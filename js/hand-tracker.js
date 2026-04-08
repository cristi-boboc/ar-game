/**
 * HandTracker - Manages MediaPipe Hands detection and clap gesture recognition.
 *
 * A "clap" is detected when both palms come within a threshold distance of each other.
 * The pop point is the midpoint between the two palms at the moment they first touch.
 */
class HandTracker {
    constructor() {
        this.hands = null;
        this.camera = null;
        this.videoElement = null;
        this.isReady = false;

        // Latest hand data
        this.leftPalm = null;
        this.rightPalm = null;
        this.landmarks = [];
        this.wasClapping = false;
        this.clapCooldown = 0;

        // Normalized distance threshold (in 0-1 coordinate space)
        this.clapThreshold = 0.08;
        // Minimum frames between claps to prevent rapid-fire
        this.clapCooldownFrames = 8;

        // Callbacks
        this.onClap = null;
        this.onHandsUpdate = null;
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
            modelComplexity: 1,
            minDetectionConfidence: 0.65,
            minTrackingConfidence: 0.5
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

        this.leftPalm = null;
        this.rightPalm = null;

        for (let i = 0; i < this.landmarks.length; i++) {
            const hand = this.landmarks[i];
            const label = handedness[i]?.label;

            const palmCenter = this._getPalmCenter(hand);

            // MediaPipe labels are mirrored in selfie mode:
            // "Right" label = user's left hand on screen, etc.
            if (label === 'Right') {
                this.leftPalm = palmCenter;
            } else {
                this.rightPalm = palmCenter;
            }
        }

        // Cooldown tick
        if (this.clapCooldown > 0) {
            this.clapCooldown--;
        }

        // Clap detection
        if (this.leftPalm && this.rightPalm) {
            const distance = this._getDistance(this.leftPalm, this.rightPalm);
            const isClapping = distance < this.clapThreshold;

            // Trigger on transition from not-clapping to clapping
            if (isClapping && !this.wasClapping && this.clapCooldown <= 0) {
                const clapPoint = {
                    x: (this.leftPalm.x + this.rightPalm.x) / 2,
                    y: (this.leftPalm.y + this.rightPalm.y) / 2
                };

                if (this.onClap) {
                    this.onClap(clapPoint);
                }

                this.clapCooldown = this.clapCooldownFrames;
            }

            this.wasClapping = isClapping;
        } else {
            this.wasClapping = false;
        }

        if (this.onHandsUpdate) {
            this.onHandsUpdate(this.landmarks, this.leftPalm, this.rightPalm);
        }
    }

    /**
     * Compute the palm center as the average of wrist and finger MCP joints.
     * Indices: 0=wrist, 5=index_MCP, 9=middle_MCP, 13=ring_MCP, 17=pinky_MCP
     */
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
