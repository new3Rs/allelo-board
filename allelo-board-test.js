/* global GoPosition BLACK WHITE */

/* テスト */
function testDraw() {
    const target = document.getElementById('target');
    const boardWidth = parseInt(target.getAttribute('data-width'));
    const boardHeight = parseInt(target.getAttribute('data-height'));
    if (boardWidth !== boardHeight) {
        throw new Error('not supported');
    }
    const position = new GoPosition(boardWidth);
    let animation = false;
    target.alleloBoard.addEventListener('click', async function(x, y) {
        if (animation) {
            return;
        }
        animation = true;
        const index = position.xyToPoint(x, y);
        const result = position.play(index);
        if (!result) {
            alert('illegal');
            animation = false;
            return;
        }
        const state = new Array(boardWidth * boardHeight);
        for (let i = 0; i < position.BOARD_SIZE2; i++) {
            switch (position.getState(i)) {
                case BLACK:
                state[i] = 1.0;
                break;
                case WHITE:
                state[i] = -1.0;
                break;
                default:
                state[i] = 0.0;
            }
        }
        await target.alleloBoard.drawStone(state, result.turn === BLACK ? 1.0 : -1.0, index, result.captives);
        animation = false;
    });
}

testDraw();