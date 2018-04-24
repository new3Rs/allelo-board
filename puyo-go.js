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

class PuyoGoBoard {
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

    /*
     * indexは置いた直後の石の位置。アニメーションする
     */
    async drawStone(boardState, addIndex, removeIndices = []) {
        const INTERVAL = 500; // ms
        const gl = this.gl;
        const b = boardState.slice();
        const opponentColor = -boardState[addIndex];
        for (const e of removeIndices) {
            b[e] = opponentColor;
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
        this.updateLeaves(boardState);
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

class PuyoGoBoardElement extends HTMLElement {
    constructor() {
        super();
        let shadowRoot = this.attachShadow({mode: 'open'});
        const template = document.getElementById('puyo-go-template').import;
        const t = template.querySelector('#puyo-go-board');
        const instance = t.content.cloneNode(true);
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
        ctx.beginPath();
        const halfSize = stoneSize / 2;
        for (let x = halfSize; x < width; x += stoneSize) {
            ctx.moveTo(x, halfSize);
            ctx.lineTo(x, height - halfSize);
        }
        for (let y = halfSize; y < width; y += stoneSize) {
            ctx.moveTo(halfSize, y);
            ctx.lineTo(width - halfSize, y);
        }
        ctx.stroke();
        const leaves = this.shadowRoot.querySelector('#leaves');
        for (let y = 1; y <= boardHeight; y++) {
            for (let x = 1; x <= boardWidth; x++) {
                const fourLeaves = document.createElementNS('http://www.w3.org/2000/svg', 'use');
                fourLeaves.id = `leaf-${x - 1 + (y - 1) * boardWidth}`;
                fourLeaves.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#four-leaves');
                fourLeaves.setAttribute('transform', `translate(${x * unitWidth - unitWidth / 2},${y * unitHeight - unitHeight / 2}) scale(0.4)`);
                fourLeaves.setAttribute('display', 'none');
                leaves.appendChild(fourLeaves);
            }
        }
        this.puyoGoBoard = new PuyoGoBoard(boardWidth, boardHeight, this.shadowRoot);
    }
}

customElements.define('puyo-go-board', PuyoGoBoardElement);
