import { bicubicInterpolate } from './utils.js';

let rnd_seed = 0;

function sample_rnd(x, y) {
    // int a=rnd_seed+x+y+(x*2561)+(y*5131);
    // return float((rnd_seed+ x*1531359+ y*8437113+ x*a*353+y*a*241+x*y*21+ 532515)&65535)/65535;
    
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

function sample_bicubic(px, py, level, width, height) {
    let rndx = px >> level;
    let x01 = (px & ((1 << level) - 1)) / (1 << level);

    let rndy = py >> level;
    let y01 = (py & ((1 << level) - 1)) / (1 << level);

    let sizex = width >> level;
    let sizey = height >> level;

    // float a[4][4] -> JS array of arrays or flat
    // but bicubicInterpolate expects p[4][4] logic or array of arrays.
    let a = [[0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0]];

    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            // sample_rnd( (i+rndx)%sizex, (j+rndy)%sizey)
            a[i][j] = sample_rnd( (i + rndx) % sizex, (j + rndy) % sizey);
        }
    }

    return bicubicInterpolate(a, x01, y01);
}

export function get_perlin(data, width, height, seed = 0, freqs = 7) {
    // rnd_seed = seed+seed*3456+seed*23521;
    rnd_seed = (seed + Math.imul(seed, 3456) + Math.imul(seed, 23521)) | 0;

    let sx = width;
    let sy = height;

    for (let j = 0; j < sy; j++) {
        for (let i = 0; i < sx; i++) {
            let v = 0.0;
            // loopk(0,7) v=v*0.5+sample_bicubic(i,j,k, width, height);	
            for (let k = 0; k < freqs; k++) {
                let sample = sample_bicubic(i, j, k, width, height);
                v = v * 0.5 + sample;
            }
            data[i + j * width] = v;
        }
    }
}

let perlinWorkerPool = [];

export async function get_perlin_async(data, width, height, seed = 0, freqs = 7) {
    // Check for SharedArrayBuffer support
    if (typeof SharedArrayBuffer === 'undefined') {
        console.warn("SharedArrayBuffer not available, falling back to synchronous perlin.");
        get_perlin(data, width, height, seed, freqs);
        return;
    }

    let localData = data;
    let needsCopyBack = false;

    // Check if the buffer is already a SharedArrayBuffer
    if (!(data.buffer instanceof SharedArrayBuffer)) {
        // Create a SharedArrayBuffer and copy data
        const sab = new SharedArrayBuffer(data.length * 4);
        localData = new Float32Array(sab);
        localData.set(data);
        needsCopyBack = true;
    }

    const cores = navigator.hardwareConcurrency || 4;
    
    // Initialize worker pool if needed
    if (perlinWorkerPool.length === 0) {
        for (let i = 0; i < cores; i++) {
            const worker = new Worker('scripts/generation/perlinWorker.js', { type: 'module' });
            perlinWorkerPool.push(worker);
        }
    } else { 
        // Ensure pool size matches cores just in case context changes, though rare
        while(perlinWorkerPool.length < cores) {
             const worker = new Worker('scripts/generation/perlinWorker.js', { type: 'module' });
             perlinWorkerPool.push(worker);
        }
    }
    
    const rowsPerCore = Math.ceil(height / cores);

    const promises = perlinWorkerPool.slice(0, cores).map((worker, index) => {
        const startY = index * rowsPerCore;
        const endY = Math.min(startY + rowsPerCore, height);
        
        if (startY >= height) return Promise.resolve(); // No work for this worker

        return new Promise((resolve, reject) => {
             const onMessage = (e) => {
                worker.removeEventListener('message', onMessage);
                worker.removeEventListener('error', onError);
                resolve();
            };
            const onError = (err) => {
                worker.removeEventListener('message', onMessage);
                worker.removeEventListener('error', onError);
                reject(err);
            };

            worker.addEventListener('message', onMessage);
            worker.addEventListener('error', onError);

            worker.postMessage({
                data: localData,
                width,
                height,
                seed,
                freqs,
                startY,
                endY
            });
        });
    });

    try {
        await Promise.all(promises);
    } catch (err) {
        console.error("Perlin Worker error:", err);
    }

    if (needsCopyBack) {
        data.set(localData);
    }
}
