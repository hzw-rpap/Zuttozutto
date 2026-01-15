import { stackblur, stackblurAsync } from './stackblur.js';
import { get_perlin, get_perlin_async } from './perlin.js';

async function Blur(data, width, height, radius) {
    if (radius === 0) return;
    // radius=radius*width/800;
    radius = Math.floor(radius * width / 800);
    
    if (radius > 254) {
        let loops = Math.floor(radius / 128);
        for (let i = 0; i < loops; i++) {
            await stackblurAsync(data, width, height, 254);
        }
    } else {
        await stackblurAsync(data, width, height, radius);
    }
}

function Normalize(data) {
    // console.log(`Normalize (Size: ${data.length})`);
    if (data.length === 0) return;

    let nanCount = 0;
    let fmin = data[0];
    let fmax = data[0];

    // Pre-pass and min/max finding
    for (let i = 0; i < data.length; i++) {
        let v = data[i];
        if (Number.isNaN(v) || !Number.isFinite(v)) {
            data[i] = 0.0;
            v = 0.0;
            nanCount++;
        }
        if (v < fmin) fmin = v;
        if (v > fmax) fmax = v;
    }

    // if (nanCount > 0) console.log(`  Fixed ${nanCount} NaNs/Infs`);
    
    // console.log(`  Range: [${fmin}, ${fmax}]`);

    let range = fmax - fmin;
    if (Math.abs(range) < 0.0001) range = 1.0;

    for (let i = 0; i < data.length; i++) {
        data[i] = (data[i] - fmin) * 200 / range;
    }
}

function ApplyRadialFalloff(width, height, data, power) {
    let cx = width * 0.5;
    let cy = height * 0.5;
    let max_r = Math.min(width, height) * 0.5;

    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            let dx = x - cx;
            let dy = y - cy;
            let dist = Math.sqrt(dx * dx + dy * dy);

            let d = dist / max_r;
            let factor = 0.0;
            if (d < 1.0) {
                factor = 1.0 - Math.pow(d, power);
            }
            data[y * width + x] *= factor;
        }
    }
}

async function Sum_Blurred(width, height, data, perlin_weight, numsteps = 8, weight = [0.1, 0.4, 0.8, 2, 4, 4, 5, 5]) {
    console.log("Sum Blurred Images\n");
    let result = new Float32Array(data);

    result.fill(0);

    for (let i = 0; i < numsteps; i++) {
        let radius = (2 << i) - 1;
        // console.log(`Blur Step ${i} of ${numsteps} radius ${radius} `);

        let tmp = new Float32Array(data);
        
        await Blur(tmp, width, height, Math.floor(radius * 2 / 3) + 1);
        await Blur(tmp, width, height, Math.floor(radius * 2 / 3));
        
        Normalize(tmp);

        // Optimization: perlin_weight is passed as reference.
        if (i === 6) {
             perlin_weight.set(tmp);
        }

        if (i === 7) {
            for (let k = 0; k < tmp.length; k++) {
                perlin_weight[k] = tmp[k] - perlin_weight[k] * 0.5;
            }
        }

        for (let j = 0; j < result.length; j++) {
            result[j] += tmp[j] * weight[i];
        }
    }

    // data=result;
    data.set(result);
    Normalize(data);
}

async function Erosion(width, height, data, rng, iterations = 20000) {
    console.log("Erosion\n");

    const getpixel = (i, j) => {
        i = Math.floor(i);
        j = Math.floor(j);
        i = ((i % width) + width) % width;
        j = ((j % height) + height) % height;
        return data[i + j * width];
    };
    
    const setpixel = (i, j, z) => {
        i = Math.floor(i);
        j = Math.floor(j);
        i = ((i % width) + width) % width;
        j = ((j % height) + height) % height;
        data[i + j * width] = z;
    };

    let v = [];
    let tmp_in = new Float32Array(data);
    
    // C++: loopi(0, 20000)
    for (let i = 0; i < iterations; i++) {
        let x = Math.abs(rng.get() % width) | 0;
        let y = Math.abs(rng.get() % height) | 0;
        v.push({ x: x, y: y, z: 1 });
    }

    for (let i = 0; i < iterations; i++) {
        for (let j = 0; j < 400; j++) {
            let w_path = (j < 5) ? (j + 1) / 5.0 : 1.0;
            
            
            let ix = Math.floor(v[i].x);
            let iy = Math.floor(v[i].y);
            let az = getpixel(ix, iy);

            let mina = { x: v[i].x, y: v[i].y, z: az };
            
            for (let l = 0; l < 4; l++) {
                 // k=(l+rng.get())&3;
                 let k = (l + rng.get()) & 3;
                 
                 let ax = [-1, 1, 1, -1];
                 let ay = [-1, -1, 1, 1];
                 
                 let bx = v[i].x + ax[k];
                 let by = v[i].y + ay[k];
                 
                 let b = getpixel(Math.floor(bx), Math.floor(by));
                 
                 if (b < mina.z) {
                     mina = { x: bx, y: by, z: b };
                 }
            }

            if (mina.z < az) {
                let newVal = az * (1.0 - 0.2 * w_path) + mina.z * 0.2 * w_path;
                setpixel(Math.floor(v[i].x), Math.floor(v[i].y), newVal);
                v[i].x = mina.x;
                v[i].y = mina.y;
            } else {
                continue;
            }
        }
    }

    let orig = new Float32Array(tmp_in);
    
    for (let i = 0; i < data.length; i++) {
        let diff = tmp_in[i] - data[i];
        if (diff < 0) diff = 0;
        data[i] = Math.sqrt(Math.sqrt(Math.sqrt(diff)));
    }
    
    tmp_in.set(data);
    data.fill(0);

    let r_arr = [0, 1, 2, 4, 8, 16, 32];
    let w_arr = [0.16, 0.32, 0.9, 6, 40, 100, 200];

    for (let j = 0; j < 7; j++) {
        let tmp = new Float32Array(tmp_in);
        await Blur(tmp, width, height, Math.floor(r_arr[j] / 2));
        
        for (let i = 0; i < data.length; i++) {
            data[i] += tmp[i] * w_arr[j];
        }
    }

    Normalize(orig);
    
    for (let i = 0; i < data.length; i++) {
        data[i] = orig[i] - data[i] * 0.6 * (0.05 + 0.95 * orig[i] / 200.0);
    }
    Normalize(data);
}


async function Add_Perlin_detail(width, height, data, perlin_weight, seed, freqs = 7) {
    console.log("Add_Perlin");
    Normalize(data);
    
    if (perlin_weight.length !== data.length) {
    }
    Normalize(perlin_weight);

    let tmp = new Float32Array(data);
    
    console.log("Generating Perlin Noise...");
    await get_perlin_async(data, width, height, seed, freqs);
    
    Normalize(data);
    
    for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
            let o = i + j * width;
            let w = ((perlin_weight[o]) / 200.0 + 0.05);
            if (w < 0) w = 0;
            
            data[o] = tmp[o] + (data[o] - 100) * Math.sqrt(w) * 0.2;
        }
    }
    Normalize(data);
}

async function Add_Perlin(width, height, data, perlin_weight, seed, freqs = 7) {
    console.log("Add_Perlin");
    Normalize(data);
    
    if (perlin_weight.length !== data.length) {
    }
    Normalize(perlin_weight);

    let tmp = new Float32Array(data);
    
    console.log("Generating Perlin Noise...");
    await get_perlin_async(data, width, height, seed, freqs);
    
    Normalize(data);
    
    for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
            let o = i + j * width;
            let w = ((perlin_weight[o]) / 200.0 + 0.05);
            if (w < 0) w = 0;
            
            data[o] = tmp[o] + (data[o] - 100) * Math.sqrt(w) * 0.075;
        }
    }
    Normalize(data);
}

export { Blur, Normalize, ApplyRadialFalloff, Sum_Blurred, Erosion, Add_Perlin,Add_Perlin_detail};
