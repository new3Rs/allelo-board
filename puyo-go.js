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
    }

    addStone(boardState, index) {
        const gl = this.gl;
        const deltaStone = this.stoneSize * 0.02;
        let newStone = deltaStone;
        const step = () => {
            // To send the data to the GPU, we first need to
            // flatten our data into a single array.
            const dataToSendToGPU = new Float32Array(boardState.length);
            for (let i = 0; i < boardState.length; i++) {
                dataToSendToGPU[i] = boardState[i] * (i === index ? newStone : this.stoneSize);
            }
            gl.uniform1fv(this.stonesHandle, dataToSendToGPU);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            newStone += deltaStone;
            if (newStone <= this.stoneSize) {
                requestAnimationFrame(step);
            }
        };
        step();
    }

    puyoRemoveStones(boardState, indices) {

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
        const stoneSize = Math.min(width / boardWidth, height / boardHeight);
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
        this.puyoGoBoard = new PuyoGoBoard(boardWidth, boardHeight, this.shadowRoot);
        /* テスト */
        const state = new Array(boardWidth * boardHeight);
        state.fill(0.0);
        state[0] = 1.0;
        state[1] = 1.0;
        state[2] = -1.0;
        state[3] = -1.0;
        this.puyoGoBoard.addStone(state, 0);
    }
}

customElements.define('puyo-go-board', PuyoGoBoardElement);
