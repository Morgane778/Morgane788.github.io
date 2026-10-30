const canvas = document.getElementById('webgl-canvas');
const gl = canvas.getContext('webgl');

if (!gl) {
    console.error('WebGL non supporté');
}

const vertexShaderSource = `
    attribute vec2 a_position;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
    }
`;

/* Shader d'ondes fluides bleues type aurore / draperie */
const fragmentShaderSource = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform vec2 u_mouse;
    uniform float u_time;

    // Fonction de bruit Simplex / Perlin simplifié
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

    float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                            -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
            + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m;
        m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }

    void main() {
        vec2 st = gl_FragCoord.xy / u_resolution.xy;
        st.x *= u_resolution.x / u_resolution.y;

        vec2 mouse = u_mouse / u_resolution.xy;
        mouse.x *= u_resolution.x / u_resolution.y;

        // Influence douce du pointeur
        vec2 mEffect = (st - mouse) * 0.3;

        // Ondulations verticales fluides
        float t = u_time * 0.4;
        
        float wave1 = sin(st.y * 3.0 + t + snoise(st * 1.5 + t * 0.2));
        float wave2 = cos(st.x * 2.5 - t * 0.8 + snoise(st * 2.0 - t * 0.3));
        
        // Distortion de coordonnées pour l'effet de tissu/aurore
        vec2 distortion = vec2(
            snoise(st * 2.0 + vec2(t * 0.3, wave1) + mEffect),
            snoise(st * 1.8 - vec2(wave2, t * 0.2) - mEffect)
        );

        float n = snoise(st * 2.5 + distortion * 1.2);

        // Palette de couleurs extraite de ton image (Bleu nuit, Indigo, Bleu Cyan lumineux, Blanc bleuté)
        vec3 deepBlue  = vec3(0.02, 0.02, 0.12);
        vec3 royalBlue = vec3(0.10, 0.12, 0.42);
        vec3 electric  = vec3(0.25, 0.45, 0.85);
        vec3 iceBlue   = vec3(0.70, 0.88, 1.00);

        // Gradient & nuances
        float mix1 = smoothstep(-0.6, 0.7, n + wave1 * 0.3);
        float mix2 = pow(smoothstep(0.1, 0.9, n + distortion.x * 0.5), 2.0);

        vec3 color = mix(deepBlue, royalBlue, mix1);
        color = mix(color, electric, mix2);
        
        // Rehauts lumineux (crêtes de vagues bleues/blanches)
        float highlight = pow(smoothstep(0.4, 0.95, distortion.y + n * 0.5), 3.0);
        color += iceBlue * highlight * 0.85;

        // Vignettage doux sur les bords
        float edge = smoothstep(1.5, 0.2, length(gl_FragCoord.xy / u_resolution.xy - 0.5));
        color *= edge;

        gl_FragColor = vec4(color, 1.0);
    }
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);

const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
const mouseLocation = gl.getUniformLocation(program, "u_mouse");
const timeLocation = gl.getUniformLocation(program, "u_time");

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1,
]), gl.STATIC_DRAW);

let mouseX = window.innerWidth * 0.25;
let mouseY = window.innerHeight * 0.5;
let targetMouseX = mouseX;
let targetMouseY = mouseY;

window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    targetMouseX = e.clientX - rect.left;
    targetMouseY = rect.bottom - e.clientY;
});

function resizeCanvas() {
    const displayWidth  = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width  = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
}

function render(time) {
    time *= 0.001;
    resizeCanvas();

    mouseX += (targetMouseX - mouseX) * 0.03;
    mouseY += (targetMouseY - mouseY) * 0.03;

    gl.useProgram(program);

    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform2f(mouseLocation, mouseX, mouseY);
    gl.uniform1f(timeLocation, time);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
}

requestAnimationFrame(render);