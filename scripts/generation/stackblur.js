const stackblur_mul = new Uint16Array([
    512,512,456,512,328,456,335,512,405,328,271,456,388,335,292,512,
    454,405,364,328,298,271,496,456,420,388,360,335,312,292,273,512,
    482,454,428,405,383,364,345,328,312,298,284,271,259,496,475,456,
    437,420,404,388,374,360,347,335,323,312,302,292,282,273,265,512,
    497,482,468,454,441,428,417,405,394,383,373,364,354,345,337,328,
    320,312,305,298,291,284,278,271,265,259,507,496,485,475,465,456,
    446,437,428,420,412,404,396,388,381,374,367,360,354,347,341,335,
    329,323,318,312,307,302,297,292,287,282,278,273,269,265,261,512,
    505,497,489,482,475,468,461,454,447,441,435,428,422,417,411,405,
    399,394,389,383,378,373,368,364,359,354,350,345,341,337,332,328,
    324,320,316,312,309,305,301,298,294,291,287,284,281,278,274,271,
    268,265,262,259,257,507,501,496,491,485,480,475,470,465,460,456,
    451,446,442,437,433,428,424,420,416,412,408,404,400,396,392,388,
    385,381,377,374,370,367,363,360,357,354,350,347,344,341,338,335,
    332,329,326,323,320,318,315,312,310,307,304,302,299,297,294,292,
    289,287,285,282,280,278,275,273,271,269,267,265,263,261,259
]);

const stackblur_shr = new Uint8Array([
    9, 11, 12, 13, 13, 14, 14, 15, 15, 15, 15, 16, 16, 16, 16, 17,
    17, 17, 17, 17, 17, 17, 18, 18, 18, 18, 18, 18, 18, 18, 18, 19,
    19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 20, 20, 20,
    20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 21,
    21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21,
    21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 22, 22, 22, 22, 22, 22,
    22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22,
    22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 23,
    23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
    23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
    23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
    23, 23, 23, 23, 23, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
    24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
    24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
    24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
    24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24
]);

export function stackblurJob(src, w, h, radius, cores, core, step, stack) {
    let x, y, xp, yp, i;
    let sp;
    let stack_start;
    let src_idx;
    let dst_idx;
    let sum_r, sum_in_r, sum_out_r;

    let wm = w - 1;
    let hm = h - 1;
    let div = (radius * 2) + 1;
    let mul_sum = stackblur_mul[radius];
    let shr_sum = stackblur_shr[radius];

    // Note: In single thread, core=0, cores=1.

    if (step === 1) {
        let minY = Math.floor(core * h / cores);
        let maxY = Math.floor((core + 1) * h / cores);

        for (y = minY; y < maxY; y++) {
            sum_r = sum_in_r = sum_out_r = 0.0;

            src_idx = w * y; // start of line (0,y)

            for (i = 0; i <= radius; i++) {
                // src_ptr[(wm-radius+i+1)%w]
                let idx_offset = (wm - radius + i + 1) % w;

                
                let v = src[src_idx + idx_offset];
                
                // stack_ptr = &stack[i]
                stack[i] = v;
                
                sum_r += v * (i + 1);
                sum_out_r += v;
            }
            
            for (i = 1; i <= radius; i++) {
                if (i <= wm) src_idx += 1; // src_ptr += 1
                // stack_ptr = &stack[i + radius]
                stack[i + radius] = src[src_idx]; // src_ptr[0]
                
                sum_r += src[src_idx] * (radius + 1 - i);
                sum_in_r += src[src_idx];
            }

            sp = radius;
            xp = radius;
            if (xp > wm) xp = wm;

            src_idx = xp + y * w; // src ptr
            dst_idx = y * w; // dst ptr

            for (x = 0; x < w + radius; x++) {
                if (x === w) dst_idx -= w;

                let val;
                if (x < w) {
                    val = (sum_r * mul_sum) / (1 << shr_sum); 
                } else {
                    let a = (x - w) / radius;
                    let existing = src[dst_idx];
                    val = existing * a + (1 - a) * (sum_r * mul_sum) / (1 << shr_sum);
                }
                src[dst_idx] = val; // Write back

                dst_idx += 1;

                sum_r -= sum_out_r;

                stack_start = sp + div - radius;
                if (stack_start >= div) stack_start -= div;
                
                // stack_ptr = &stack[stack_start]
                let s_val = stack[stack_start];

                sum_out_r -= s_val;

                if (xp < wm) {
                    src_idx += 1;
                    ++xp;
                }
                if (xp === wm) {
                    src_idx -= wm;
                    xp = 0;
                }

                // stack_ptr[0] = src_ptr[0]
                stack[stack_start] = src[src_idx];

                sum_in_r += src[src_idx];
                sum_r += sum_in_r;

                ++sp;
                if (sp >= div) sp = 0;
                
                // stack_ptr = &stack[sp]
                sum_out_r += stack[sp];
                sum_in_r -= stack[sp];
            }
        }
    }

    if (step === 2) {
        let minX = Math.floor(core * w / cores);
        let maxX = Math.floor((core + 1) * w / cores);

        for (x = minX; x < maxX; x++) {
            sum_r = sum_in_r = sum_out_r = 0.0;

            src_idx = x; // x, 0
            
            for (i = 0; i <= radius; i++) {
                // ((hm-radius+i+1)%h)*w + src_idx_offset_x (which is 0 relative to src_ptr start)
                let y_idx = (hm - radius + i + 1) % h;
                let v = src[src_idx + y_idx * w];
                
                stack[i] = v;
                sum_r += v * (i + 1);
                sum_out_r += v;
            }

            for (i = 1; i <= radius; i++) {
                if (i <= hm) src_idx += w; // +stride
                
                stack[i + radius] = src[src_idx];
                sum_r += src[src_idx] * (radius + 1 - i);
                sum_in_r += src[src_idx];
            }

            sp = radius;
            yp = radius;
            if (yp > hm) yp = hm;

            src_idx = x + yp * w;
            dst_idx = x;

            for (y = 0; y < h + radius; y++) {
                if (y === h) dst_idx -= h * w;

                let val;
                if (y < h) {
                    val = (sum_r * mul_sum) / (1 << shr_sum);
                } else {
                    let a = (y - h) / radius;
                    let existing = src[dst_idx];
                    val = a * existing + (1 - a) * (sum_r * mul_sum) / (1 << shr_sum);
                }
                src[dst_idx] = val;

                dst_idx += w;

                sum_r -= sum_out_r;

                stack_start = sp + div - radius;
                if (stack_start >= div) stack_start -= div;
                
                let s_val = stack[stack_start];

                sum_out_r -= s_val;

                if (yp < hm) {
                    src_idx += w;
                    ++yp;
                }
                if (yp === hm) {
                    src_idx -= w * hm;
                    yp = 0;
                }

                stack[stack_start] = src[src_idx];
                sum_in_r += src[src_idx];
                sum_r += sum_in_r;

                ++sp;
                if (sp >= div) sp = 0;
                
                sum_out_r += stack[sp];
                sum_in_r -= stack[sp];
            }
        }
    }
}

export function stackblur(src, w, h, radius) {
    if (radius > 254) return;
    if (radius < 1) return;

    let div = (radius * 2) + 1;
    let stack = new Float32Array(div);

    stackblurJob(src, w, h, radius, 1, 0, 1, stack);
    stackblurJob(src, w, h, radius, 1, 0, 2, stack);
}

let workerPool = [];

export async function stackblurAsync(src, w, h, radius) {
    if (radius > 254) return;
    if (radius < 1) return;

    // Check for SharedArrayBuffer support
    if (typeof SharedArrayBuffer === 'undefined') {
        console.warn("SharedArrayBuffer not available, falling back to synchronous stackblur.");
        stackblur(src, w, h, radius);
        return;
    }

    let localSrc = src;
    let needsCopyBack = false;

    // Check if the buffer is already a SharedArrayBuffer
    if (!(src.buffer instanceof SharedArrayBuffer)) {
        // Create a SharedArrayBuffer and copy data
        const sab = new SharedArrayBuffer(src.length * 4);
        localSrc = new Float32Array(sab);
        localSrc.set(src);
        needsCopyBack = true;
    }

    const cores = navigator.hardwareConcurrency || 4;
    
    // Initialize worker pool if needed
    if (workerPool.length === 0) {
        for (let i = 0; i < cores; i++) {
            const worker = new Worker(new URL('./stackblurWorker.js', import.meta.url), { type: 'module' });
            workerPool.push(worker);
        }
    }

    const runStep = (step) => {
        return Promise.all(workerPool.map((worker, index) => {
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
                    src: localSrc,
                    w,
                    h,
                    radius,
                    cores: workerPool.length,
                    core: index,
                    step
                });
            });
        }));
    };

    try {
        // Step 1: Horizontal Blur
        await runStep(1);
        
        // Step 2: Vertical Blur
        await runStep(2);
    } catch (err) {
        console.error("Worker error:", err);
    } 
    // Do not terminate workers, keep them for next run

    // If we used a temporary SharedArrayBuffer, copy the result back
    if (needsCopyBack) {
        src.set(localSrc);
    }
}
