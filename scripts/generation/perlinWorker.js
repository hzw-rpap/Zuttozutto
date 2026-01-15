// Function to perform cubic interpolation
function cubicInterpolate(p, x) {
    // p is array of 4 floats
    // return p[1] + 0.5 * x*(p[2] - p[0] + x*(2.0*p[0] - 5.0*p[1] + 4.0*p[2] - p[3] + x*(3.0*(p[1] - p[2]) + p[3] - p[0])));
    return p[1] + 0.5 * x * (p[2] - p[0] + x * (2.0 * p[0] - 5.0 * p[1] + 4.0 * p[2] - p[3] + x * (3.0 * (p[1] - p[2]) + p[3] - p[0])));
}

// Function to perform bicubic interpolation
function bicubicInterpolate(p, x, y) {
    // p is 4x4 array
    let arr = new Float32Array(4);
    arr[0] = cubicInterpolate(p[0], y);
    arr[1] = cubicInterpolate(p[1], y);
    arr[2] = cubicInterpolate(p[2], y);
    arr[3] = cubicInterpolate(p[3], y);
    return cubicInterpolate(arr, x);
}

// Re-implement the sampling functions inside the worker to avoid import issues or dependency complexities
function sample_rnd(x, y, rnd_seed) {
    let a = (((rnd_seed + x) | 0) + y + (Math.imul(x, 2561)) + (Math.imul(y, 5131))) | 0;

    let t1 = rnd_seed;
    let t2 = Math.imul(x, 1531359);
    let t3 = Math.imul(y, 8437113);
    
    // x*a*353
    let xa = Math.imul(x, a);
    let t4 = Math.imul(xa, 353);

    // y*a*241
    let ya = Math.imul(y, a);
    let t5 = Math.imul(ya, 241);

    // x*y*21
    let xy = Math.imul(x, y);
    let t6 = Math.imul(xy, 21);

    let t7 = 532515;

    let sum = (t1 + t2 + t3 + t4 + t5 + t6 + t7) | 0; // Force wrapping sum

    return (sum & 65535) / 65535.0;
}

function sample_bicubic(px, py, level, width, height, rnd_seed) {
    let rndx = px >> level;
    let x01 = (px & ((1 << level) - 1)) / (1 << level);

    let rndy = py >> level;
    let y01 = (py & ((1 << level) - 1)) / (1 << level);

    let sizex = width >> level;
    let sizey = height >> level;

    // float a[4][4] -> JS array of arrays
    let a = [[0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0]];

    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            a[i][j] = sample_rnd( (i + rndx) % sizex, (j + rndy) % sizey, rnd_seed);
        }
    }

    return bicubicInterpolate(a, x01, y01);
}

self.onmessage = function(e) {
    const { data, width, height, seed, freqs, startY, endY } = e.data;
    
    // Calculate global rnd_seed based on the input seed, same as in perlin.js
    const rnd_seed = (seed + Math.imul(seed, 3456) + Math.imul(seed, 23521)) | 0;

    // We only process rows from startY to endY
    for (let j = startY; j < endY; j++) {
        for (let i = 0; i < width; i++) {
            let v = 0.0;
            for (let k = 0; k < freqs; k++) {
                let sample = sample_bicubic(i, j, k, width, height, rnd_seed);
                v = v * 0.5 + sample;
            }
            // Use Atomics if needed, but here we have disjoint regions so direct assignment is fine
            // IF 'data' is a SharedArrayBuffer view
            data[i + j * width] = v;
        }
    }
    
    self.postMessage({ status: 'done', startY, endY });
};
