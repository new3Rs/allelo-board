function removeElement(array, element) {
    const index = array.indexOf(element);
    if (index < 0) {
        return;
    }
    array.splice(index, 1);
}

function compileShader(gl, elem, width, height, boardWidth, boardHeight) {
    let shaderType;
    switch (elem.type) {
        case 'x-shader/x-vertex':
        shaderType = gl.VERTEX_SHADER;
        break;
        case 'x-shader/x-fragment':
        shaderType = gl.FRAGMENT_SHADER;
        break;
        default:
        return;
    }
    const shader = gl.createShader(shaderType);
    gl.shaderSource(shader, elem.text
        .replace(/%BOARD_WIDTH%/g, boardWidth)
        .replace(/%BOARD_HEIGHT%/g, boardHeight)
        .replace(/%WIDTH%/g, width)
        .replace(/%HEIGHT%/g, height));
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw "Shader compile failed with: " + gl.getShaderInfoLog(shader);
    }
    return shader;
}

function getAttribLocation(gl, program, name) {
    var attributeLocation = gl.getAttribLocation(program, name);
    if (attributeLocation === -1) {
        throw 'Can not find attribute ' + name + '.';
    }
    return attributeLocation;
}

function getUniformLocation(gl, program, name) {
    var uniformLocation = gl.getUniformLocation(program, name);
    if (uniformLocation === -1) {
        throw 'Can not find uniform ' + name + '.';
    }
    return uniformLocation;
}

class AlleloBoard {
    constructor(boardWidth, boardHeight, shadowRoot) {
        this.boardWidth = boardWidth;
        this.boardHeight = boardHeight;
        this.shadowRoot = shadowRoot;
        this.listeners = {};
        const stones = shadowRoot.querySelector('#stones');
        const width = parseInt(stones.getAttribute('width'));
        const height = parseInt(stones.getAttribute('height'));
        const gl = stones.getContext('webgl');
        const vertexShader = compileShader(gl, shadowRoot.getElementById('vs'), width, height, boardWidth, boardHeight);
        const fragmentShader = compileShader(gl, shadowRoot.getElementById('fs'), width, height, boardWidth, boardHeight);
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.useProgram(program);
        const vertexData = new Float32Array([
            -1.0,  1.0, // top left
            -1.0, -1.0, // bottom left
             1.0,  1.0, // top right
             1.0, -1.0, // bottom right
        ]);
        const vertexDataBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexDataBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
        const positionHandle = getAttribLocation(gl, program, 'position');
        gl.enableVertexAttribArray(positionHandle);
        gl.vertexAttribPointer(
            positionHandle,
            2, // position is a vec2
            gl.FLOAT, // each component is a float
            gl.FALSE, // don't normalize values
            2 * 4, // two 4 byte float components per vertex
            0 // offset into each span of vertex data
        );
        this.stonesHandle = getUniformLocation(gl, program, 'states');
        this.gl = gl;
        this.stoneSize = Math.min(width / boardWidth, height / boardHeight) / 2.0;
        this.leaves = shadowRoot.getElementById('leaves');
        stones.addEventListener('click', this.clickHandler.bind(this), false);
    }

    xyToPoint(x, y) {
        return (x - 1) + (y - 1) * this.boardWidth;
    }

    pointToXy(p) {
        const y = p % this.boardWidth;
        const x = p - y * this.boardWidth;
        return [x + 1, y + 1];
    }

    /*
     * indexは置いた直後の石の位置。アニメーションする
     */
    async drawStone(boardState, color, addIndex, removeIndices = []) {
        const INTERVAL = 500; // ms
        const gl = this.gl;
        const b = boardState.slice();
        if (removeIndices.includes(addIndex)) {
            for (const e of removeIndices) {
                b[e] = color;
            }
        } else {
            const opponentColor = -color;
            for (const e of removeIndices) {
                b[e] = opponentColor;
            }
        }
        if (addIndex != null) {
            await new Promise((res, rej) => {
                const start = Date.now();
                const grow = () => {
                    const dataToSendToGPU = new Float32Array(b.length);
                    const interval = Date.now() - start;
                    const addStone = this.stoneSize * Math.min(interval / INTERVAL, 1.0);
                    for (let i = 0; i < b.length; i++) {
                        dataToSendToGPU[i] = b[i] * (i === addIndex ? addStone : this.stoneSize);
                    }
                    gl.uniform1fv(this.stonesHandle, dataToSendToGPU);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    if (interval <= INTERVAL) {
                        requestAnimationFrame(grow);
                    } else {
                        res();
                    }
                };
                grow();
            });
        } else {
            const dataToSendToGPU = new Float32Array(b.length);
            for (let i = 0; i < b.length; i++) {
                dataToSendToGPU[i] = b[i] * this.stoneSize;
            }
            gl.uniform1fv(this.stonesHandle, dataToSendToGPU);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        this.updateLeaves(boardState);
        if (removeIndices.length > 0) {
            await new Promise((res, rej) => {
                const start = Date.now();
                const decline = () => {
                    // To send the data to the GPU, we first need to
                    // flatten our data into a single array.
                    const dataToSendToGPU = new Float32Array(b.length);
                    const interval = Date.now() - start;
                    const removedStone = this.stoneSize * Math.max((INTERVAL - interval) / INTERVAL, 0.0);
                    for (let i = 0; i < b.length; i++) {
                        dataToSendToGPU[i] = b[i] * (removeIndices.includes(i) ? removedStone : this.stoneSize);
                    }
                    gl.uniform1fv(this.stonesHandle, dataToSendToGPU);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    if (interval <= INTERVAL) {
                        requestAnimationFrame(decline);
                    } else {
                        res();
                    }
                };
                decline();
            });
        }
    }

    updateLeaves(boardState) {
        for (let i = 0; i < this.boardWidth * this.boardHeight; i++) {
            const leaf = this.leaves.getElementById(`leaf-${i}`);
            if (boardState[i]) {
                leaf.removeAttribute('display');
                leaf.setAttribute('style', boardState[i] > 0.0 ? 'fill:#004d00;stroke:none' : 'fill:#00ff00;stroke:none');
            } else {
                leaf.setAttribute('display', 'none');
            }
        }
    }

    addEventListener(type, handler) {
        if (!this.listeners[type]) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(handler);
    }

    removeEventListener(type, handler) {
        if (!this.listeners[type]) {
            return;
        }
        if (handler) {
            removeElement(this.listeners[type], handler);
        } else {
            this.listeners[type] = [];
        }
    }

    clickHandler(event) {
        const rect = event.currentTarget.getBoundingClientRect();
        const stones = this.shadowRoot.querySelector('#stones');
        const x = Math.floor(this.boardWidth * (event.clientX - rect.left) / stones.offsetWidth) + 1;
        const y = Math.floor(this.boardHeight * (event.clientY - rect.top) / stones.offsetHeight) + 1;
        if (this.listeners.click) {
            for (const e of this.listeners.click) {
                e(x, y);
            }
        }
    }
}

class AlleloBoardElement extends HTMLElement {
    static init() {
        this.prototype.template = document.createElement('template');
        this.prototype.template.id = 'allelo-board';
        this.prototype.template.innerHTML = `
<style>
    :host {
        display: inline-block;  /* or display: block; */
    }
    .container {
        position: relative;
    }
    canvas {
        display: block; /* デフォルトのinlineのままだとcanvasの下に隙間が入る */
    }
    #goban {
        position: relative;
        background-image: url(data:image/png;base64,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);
        background-color: rgb(196, 127, 51);
    }
    #leaves, #stones {
        position: absolute;
        top: 0px;
    }
</style>
<div class="container">
    <canvas id="goban" width="768" height="768"></canvas>
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" id="leaves" width="768" height="768">
        <defs>
            <path
            id="leaf"
            d="m 0,-145 c -5.36199,-1.5478604 -14.21002,-8.6465004 -15.2827,-22.05113 -1.07198,-13.40533 13.94132,-32.17336 16.35468,-37.80264 2.41335,-5.63069 5.89798,0.53528 10.72469,5.36199 4.826,4.82601 31.099959,32.70794 -3.21876,54.1573096 -2.1991,1.3477504 -2.12414,2.5074104 -1.84201,5.7565604 0.4773,5.48079 1.34068,4.67681 0.86479,5.39169 -0.94116,1.41068 -4.76802,1.98344 -4.7666,0.4773 -0.001,-8.58004 -3.771,-25.1482604 -0.50983,-37.92426 4.29002,-16.80157 1.5521,-19.18452 1.5521,-19.18452 0,0 -1.6617,10.93895 -3.51856,18.29286 -4.46821,17.69534958 -0.3578,27.52484 -0.3578,27.52484 z"/>
        </defs>
        <defs>
            <g id="four-leaves">
                <use
                xlink:href="#leaf"
                transform="rotate(0)" 
                />
                <use
                xlink:href="#leaf"
                transform="rotate(90)" 
                />
                <use
                xlink:href="#leaf"
                transform="rotate(180)" 
                />
                <use
                xlink:href="#leaf"
                transform="rotate(270)" 
                />
            </g>
        </defs>
    </svg>
    <canvas id="stones" width="768" height="768"></canvas>
</div>
<script id="vs" type="x-shader/x-vertex">
    attribute vec2 position;

    void main() {
        // position specifies only x and y.
        // We set z to be 0.0, and w to be 1.0
        gl_Position = vec4(position, 0.0, 1.0);
    }
</script>
<script id="fs" type="x-shader/x-fragment">
    precision lowp float;
    const int BOARD_WIDTH = %BOARD_WIDTH%;
    const int BOARD_HEIGHT = %BOARD_HEIGHT%;
    const float WIDTH = %WIDTH%.0;
    const float HEIGHT = %HEIGHT%.0;
    uniform float states[BOARD_WIDTH * BOARD_HEIGHT];
    
    void main() {
        float _width = WIDTH / float(BOARD_WIDTH) / 2.0;
        float _height = HEIGHT / float(BOARD_HEIGHT) / 2.0;
        float x = gl_FragCoord.x;
        float y = gl_FragCoord.y;
        float b = 0.0;
        float w = 0.0;
        for (int j = 0; j < BOARD_HEIGHT; j++) {
            for (int i = 0; i < BOARD_WIDTH; i++) {
                float r = states[i + j * BOARD_WIDTH];
                float dx = _width + float(i) * 2.0 * _width - x;
                float dy = _height + float(j) * 2.0 * _height - (HEIGHT - y);
                float ratio = r*r/(dx*dx + dy*dy);
                ratio = ratio * ratio;
                ratio = ratio * ratio;
                ratio = ratio * ratio;
                if (r > 0.0) {
                    b += ratio;
                } else {
                    w += ratio;
                }
            }
        }
        float alpha = float(b > 1.0 || w > 1.0);
        float white = float(w > 1.0);
        gl_FragColor = vec4(0.0, white + 0.3, 0.0, alpha);
    }
</script>
`;
    }

    constructor() {
        super();
        let shadowRoot = this.attachShadow({mode: 'open'});
        const instance = this.template.content.cloneNode(true);
        shadowRoot.appendChild(instance);
        this.puyoInitialize();
    }

    connectedCallback() {
        console.log('connectedCallback');
    }

    disconnectedCallback() {
        console.log('disconnectedCallback');
    }

    adoptedCallback() {
        console.log('adoptedCallback');
    }

    attributeChangedCallback(name, oldvalue, newValue) {
        if (name === 'data-width' || name === 'data-height') {
            this.puyoInitialize();
        }
    }

    puyoInitialize() {
        const boardWidth = parseInt(this.getAttribute('data-width'));
        const boardHeight = parseInt(this.getAttribute('data-height'));
        const goban = this.shadowRoot.querySelector('#goban');
        const width = parseInt(goban.getAttribute('width'));
        const height = parseInt(goban.getAttribute('height'));
        const ctx = goban.getContext('2d');
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgb(0, 0, 0)';
        const unitWidth = width / boardWidth;
        const unitHeight = height / boardHeight;
        const stoneSize = Math.min(unitWidth, unitHeight);
        const halfSize = stoneSize / 2;
        function drawLines() {
            ctx.beginPath();
            for (let x = halfSize; x < width; x += stoneSize) {
                ctx.moveTo(x, halfSize);
                ctx.lineTo(x, height - halfSize);
            }
            for (let y = halfSize; y < width; y += stoneSize) {
                ctx.moveTo(halfSize, y);
                ctx.lineTo(width - halfSize, y);
            }
            ctx.stroke();
        }
        function drawIntersections() {
            for (let y = halfSize; y < width; y += stoneSize) {
                for (let x = halfSize; x < width; x += stoneSize) {
                    ctx.beginPath();
                    ctx.arc(x, y, halfSize / 20, 0, Math.PI*2, false);
                    ctx.fill();
                }
            }
        }
        //drawLines();
        drawIntersections();
        const leaves = this.shadowRoot.querySelector('#leaves');
        const scale = unitWidth * 0.0036;
        for (let y = 1; y <= boardHeight; y++) {
            for (let x = 1; x <= boardWidth; x++) {
                const fourLeaves = document.createElementNS('http://www.w3.org/2000/svg', 'use');
                fourLeaves.id = `leaf-${x - 1 + (y - 1) * boardWidth}`;
                fourLeaves.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#four-leaves');
                fourLeaves.setAttribute('transform', `translate(${x * unitWidth - unitWidth / 2},${y * unitHeight - unitHeight / 2}) scale(${scale})`);
                fourLeaves.setAttribute('display', 'none');
                leaves.appendChild(fourLeaves);
            }
        }
        this.alleloBoard = new AlleloBoard(boardWidth, boardHeight, this.shadowRoot);
    }
}

AlleloBoardElement.init();
customElements.define('allelo-board', AlleloBoardElement);
