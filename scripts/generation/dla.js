import { Rng } from './utils.js';

export function DLA(width, height, data, max_points, rng, seed_val) {
    console.log("Diffusion-limited aggregation (DLA)");
    console.log(`DLA Start: data size ${data.length}`);

    // Local pixel access
    const getpixel = (i, j) => {
        i = Math.floor(i);
        j = Math.floor(j);
        i = ((i % width) + width) % width; // JS modulo can be negative
        j = ((j % height) + height) % height;
        return data[i + j * width];
    };

    const setpixelmax = (i, j, z) => {
        i = Math.floor(i); 
        j = Math.floor(j);
        i = ((i % width) + width) % width;
        j = ((j % height) + height) % height;
        let ofs = i + j * width;
        if (z > data[ofs]) data[ofs] = z;
    };

    // Recursive line drawing
    const line_with_rnd = (a, b) => {
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let length = Math.sqrt(dx * dx + dy * dy);

        if (length < 1) return;

        let rnd = rng.getv3f();
        // rnd.z += float(seed_val % 15 + 2) / 7.0f;
        rnd.z += ((seed_val % 15) + 2) / 7.0;

        // vec3f middle = (a + b) / 2 + rnd * length * 0.4f;
        let middle = {
            x: (a.x + b.x) / 2 + rnd.x * length * 0.4,
            y: (a.y + b.y) / 2 + rnd.y * length * 0.4,
            z: (a.z + b.z) / 2 + rnd.z * length * 0.4
        };

        setpixelmax(middle.x, middle.y, middle.z);

        line_with_rnd(a, middle);
        line_with_rnd(middle, b);
    };

    let v = []; // vector<vec3f>
    let w = []; // vector<int>

    v.push({ x: width / 2.0, y: height / 2.0, z: 100 });
    w.push(0);

    let pmax = max_points;
    let radmax = Math.floor(width * 16 / 1024);
    let radmax2 = Math.floor(width / 6);

    for (let i = 0; i < pmax; ++i) {
        // if (i % 100 == 0) process.stdout.write(`${i} of ${pmax} points\r`);

        let id = Math.abs(rng.get()) % v.length;
        if (id >= v.length) continue;

        let angle = Math.abs(rng.get()) % 2127;
        // int radius = ((rng.get() % radmax) + radmax) * (((i * i) & 3) + 1) * ((i & 7) + 1);
        let r_rnd = Math.abs(rng.get()) % radmax;
        let radius = (r_rnd + radmax) * (((Math.imul(i, i)) & 3) + 1) * ((i & 7) + 1);

        if (radius > radmax2) radius = radmax2;

        let px = Math.sin(angle) * radius;
        let py = Math.cos(angle) * radius;
        let pz = 0;

        pz = (Math.abs(rng.get()) % 111) - v[id].z;
        let p = { x: px, y: py, z: pz };

        let steps = 4 * radius;
        let skip = 0;

        let startJ = Math.floor(steps / 5);
        let endJ = Math.floor(steps * 5 / 4) + 1;

        for (let j = startJ; j < endJ; ++j) {
            let a = j / steps;
            let qx = v[id].x + p.x * a;
            let qy = v[id].y + p.y * a;
            
            // i, j for getpixel need to be int
            if (getpixel(Math.floor(qx), Math.floor(qy)) > 0) {
                skip = 1;
                break;
            }
        }
        
        if (skip) continue;

        let cur = {
            x: v[id].x + p.x,
            y: v[id].y + p.y,
            z: v[id].z + p.z
        };
        
        line_with_rnd(v[id], cur);
        
        v.push(cur);
    }
    console.log("DLA Finished");
}
