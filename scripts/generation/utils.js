
const bigValues = {
    v751423: 751423n,
    v234423: 234423n,
    v346: 346n,
    v342521: 342521n,
    v93337524: 93337524n,
    v2346: 2346n,
    v234621356: 234621356n
};

export class Rng {
    constructor(s) {
        this.seed = (453413 + s) | 0;
    }

    get() {
        let s = BigInt(this.seed);
        
        let t1_mul = BigInt.asIntN(32, s * 751423n); 
        let t1 = t1_mul ^ 234423n;

        let s2 = BigInt.asIntN(32, s * s); 
        let t2 = BigInt.asIntN(32, s2 * 346n);

        let s3 = BigInt.asIntN(32, s2 * s); 
        let t3 = BigInt.asIntN(32, s3 * 342521n);

        let t4 = 93337524n;

        let t5 = s / 2346n; 

        let t6 = s ^ 234621356n;

        let t7 = s2 >> 16n;

        let res = t1 - t2 + t3 - t4 + t5 - t6 + t7;
        
        this.seed = Number(BigInt.asIntN(32, res));
        return this.seed;
    }

    get256() {
        return (this.get() & 511) - 256;
    }

    getv3f() {
        let x = this.get256();
        let y = this.get256();
        let z = this.get256();
        let len = Math.sqrt(x*x + y*y + z*z);
        if (len > 0) {
            x /= len;
            y /= len;
            z /= len;
        }
        return {x: Math.fround(x), y: Math.fround(y), z: Math.fround(z)};
    }
}

export function cubicInterpolate(p, x) {
    // p is array of 4 floats
    // return p[1] + 0.5 * x*(p[2] - p[0] + x*(2.0*p[0] - 5.0*p[1] + 4.0*p[2] - p[3] + x*(3.0*(p[1] - p[2]) + p[3] - p[0])));
    return p[1] + 0.5 * x * (p[2] - p[0] + x * (2.0 * p[0] - 5.0 * p[1] + 4.0 * p[2] - p[3] + x * (3.0 * (p[1] - p[2]) + p[3] - p[0])));
}

export function bicubicInterpolate(p, x, y) {
    // p is 4x4 array
    let arr = new Float32Array(4);
    arr[0] = cubicInterpolate(p[0], y);
    arr[1] = cubicInterpolate(p[1], y);
    arr[2] = cubicInterpolate(p[2], y);
    arr[3] = cubicInterpolate(p[3], y);
    return cubicInterpolate(arr, x);
}
