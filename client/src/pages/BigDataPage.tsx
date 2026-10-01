import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Страница-бенчмарк: рисуем N анимированных точек тремя способами и сравниваем FPS.
// Главная идея: чем больше работы уходит с CPU/DOM на GPU, тем больше точек выдерживает страница.

type Mode = "dom" | "canvas2d" | "webgl";

// Режимы и их "потолок" по числу точек — выше этого значения режим уже не тянет.
const MODES: { id: Mode; label: string; max: number }[] = [
  { id: "dom", label: "DOM (div)", max: 5_000 },
  { id: "canvas2d", label: "Canvas 2D", max: 300_000 },
  { id: "webgl", label: "WebGL (GPU)", max: 2_000_000 },
];

// Амплитуда колебаний точки, в долях размера области (0.02 = 2%).
const AMPLITUDE = 0.02;

// Генерирует данные точек один раз и переиспользует во всех режимах (сравнение честное).
// base[i*2], base[i*2+1] in [0,1) — базовая позиция (x, y) точки в долях ширины/высоты
// phase[i] in [0, 2π) — случайный сдвиг фазы, чтобы точки колебались не синхронно
function useData(count: number) {
  // useMemo: массивы пересоздаются только при смене count, а не на каждый рендер.
  return useMemo(() => {
    // Float32Array — компактные типизированные массивы, быстрые и готовые к загрузке в GPU.
    console.log(count, count * 2, new Float32Array(count * 2).length)
    const base = new Float32Array(count * 2);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      base[i * 2] = Math.random();
      base[i * 2 + 1] = Math.random();
      phase[i] = Math.random() * Math.PI * 2;
    }
    return { base, phase };
  }, [count]);
}

type Data = ReturnType<typeof useData>;

// ---------- Режим 1: DOM ----------
// Каждая точка — отдельный <div>. Самый медленный способ: браузер управляет тысячами узлов.
function DomPoints({ data, count }: { data: Data; count: number }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current!;
    // Берём уже отрендеренные React'ом div'ы один раз, чтобы не искать их каждый кадр.
    const nodes = Array.from(el.children) as HTMLElement[];
    let raf = 0;
    // Цикл анимации: ms — время в миллисекундах от requestAnimationFrame.
    const tick = (ms: number) => {
      const t = ms / 1000; // секунды
      const w = el.clientWidth;
      const h = el.clientHeight;
      for (let i = 0; i < nodes.length; i++) {
        // Позиция = база + небольшое колебание (sin по x, cos по y с другой частотой), в пикселях.
        const x = (data.base[i * 2] + AMPLITUDE * Math.sin(t + data.phase[i])) * w;
        const y = (data.base[i * 2 + 1] + AMPLITUDE * Math.cos(t * 1.3 + data.phase[i])) * h;
        // transform не вызывает layout (в отличие от left/top), но стиль всё равно ставится на каждый узел.
        nodes[i].style.transform = `translate(${x}px, ${y}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Cleanup: останавливаем анимацию при размонтировании или смене данных.
    return () => cancelAnimationFrame(raf);
  }, [data, count]);

  return (
    <div ref={host} className="relative h-full w-full overflow-hidden">
      {/* count маленьких квадратов 2x2px; все в левом верхнем углу, дальше их двигает transform */}
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="absolute left-0 top-0 h-[2px] w-[2px] bg-sky-500" />
      ))}
    </div>
  );
}

// ---------- Режим 2: Canvas 2D ----------
// Все точки рисуются на одном <canvas>. Позиции считает CPU в JS-цикле, но DOM-узлов нет.
function Canvas2DPoints({ data, count }: { data: Data; count: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    // devicePixelRatio: на retina-экранах физических пикселей больше, чем CSS-пикселей.
    const dpr = window.devicePixelRatio || 1;
    // Размер буфера canvas (в физических пикселях) подгоняем под его CSS-размер.
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    // Пересчитываем размер буфера при изменении размера элемента.
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    const size = 2 * dpr; // размер точки в физических пикселях
    const tick = (ms: number) => {
      const t = ms / 1000;
      const w = canvas.width;
      const h = canvas.height;
      // Стираем предыдущий кадр.
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0ea5e9";
      // one path, one fill() — batching is the whole point
      // Все квадраты добавляем в один путь и закрашиваем одним вызовом — это на порядки быстрее,
      // чем fillRect для каждой точки отдельно.
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        // Та же формула колебания, что и в DOM-режиме, но в координатах буфера canvas.
        const x = (data.base[i * 2] + AMPLITUDE * Math.sin(t + data.phase[i])) * w;
        const y = (data.base[i * 2 + 1] + AMPLITUDE * Math.cos(t * 1.3 + data.phase[i])) * h;
        ctx.rect(x, y, size, size);
      }
      ctx.fill();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [data, count]);

  return <canvas ref={ref} className="h-full w-full" />;
}

// ---------- Режим 3: WebGL ----------
// Вершинный шейдер выполняется на GPU параллельно для каждой точки.
// ${AMPLITUDE} подставляется в GLSL-код как константа при создании строки.
const vertexShader = /* glsl */ `
  attribute float aPhase;   // фаза точки (из геометрии)
  uniform float uTime;      // время, одно для всех точек (обновляется из JS)
  uniform float uSize;      // размер точки в пикселях
  void main() {
    // position.xy — базовая позиция в [0,1]; добавляем то же колебание sin/cos, что и в других режимах.
    vec2 p = position.xy + ${AMPLITUDE} * vec2(sin(uTime + aPhase), cos(uTime * 1.3 + aPhase));
    // [0,1] -> clip space [-1,1], который ожидает WebGL. Камера и матрицы не нужны.
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = uSize;
  }
`;
// Фрагментный шейдер: каждый пиксель точки закрашивается одним цветом (тот же sky-500, что и #0ea5e9).
const fragmentShader = /* glsl */ `
  void main() { gl_FragColor = vec4(0.055, 0.647, 0.914, 1.0); }
`;

function WebGLPoints({ data, count }: { data: Data; count: number }) {
  // Геометрия и материал создаются один раз на (data, count) и живут в GPU-памяти.
  const { geometry, material } = useMemo(() => {
    // THREE.Points требует position как vec3, поэтому z оставляем нулём (Float32Array заполнен нулями).
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = data.base[i * 2];
      positions[i * 3 + 1] = data.base[i * 2 + 1];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    // aPhase — свой атрибут; subarray берёт первые count значений без копирования.
    g.setAttribute("aPhase", new THREE.BufferAttribute(data.phase.subarray(0, count), 1));
    const m = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      // uniforms — значения, общие для всех вершин; uTime мы будем менять каждый кадр.
      uniforms: { uTime: { value: 0 }, uSize: { value: 2 * (window.devicePixelRatio || 1) } },
    });
    return { geometry: g, material: m };
  }, [data, count]);

  // Освобождаем GPU-ресурсы, когда геометрия/материал больше не нужны (иначе утечка памяти).
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  // Animation runs entirely in the vertex shader: JS only bumps one uniform per frame.
  // Вся анимация — в шейдере; JS каждый кадр лишь обновляет один uniform (uTime).
  return (
    <Canvas
      // реальный pixelRatio экрана; r3f сам переприменяет его при ресайзе (uSize тоже учитывает dpr)
      dpr={window.devicePixelRatio || 1}
      gl={{ antialias: false }} // сглаживание отключено — это дорого и для 2px точек не нужно
      frameloop="always" // рендерить непрерывно, а не только при изменении сцены
    >
      <Tick material={material} />
      {/* frustumCulled=false: bounding sphere считается по координатам 0..1, а шейдер двигает точки сам,
          поэтому отсечение по камере могло бы ошибочно скрыть всё облако */}
      <points geometry={geometry} material={material} frustumCulled={false} />
    </Canvas>
  );
}

// Невидимый компонент: на каждом кадре записывает время в uniform шейдера.
// useFrame работает только внутри <Canvas>, поэтому это отдельный компонент.
function Tick({ material }: { material: THREE.ShaderMaterial }) {
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });
  return null;
}

// ---------- Счётчик FPS ----------
function useFps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      frames++; // считаем кадры
      // Раз в 500 мс переводим кадры в FPS. Обновляем state редко, чтобы сам счётчик не тормозил страницу.
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

// ---------- Страница ----------
export default function BigDataPage() {
  const [mode, setMode] = useState<Mode>("canvas2d");
  // Сколько точек просил пользователь (ползунком).
  const [requested, setRequested] = useState(5_000);
  const fps = useFps();

  const current = MODES.find((m) => m.id === mode)!;
  // Реально рисуем не больше, чем выдерживает выбранный режим.
  const count = Math.min(requested, current.max);
  // Данные генерируем под requested, чтобы при переключении режимов точки не менялись;
  // рендерер использует из них первые count штук.
  const data = useData(Math.max(requested, 1));

  return (
    // 56px — высота NavBar; страница занимает остаток экрана.
    <div className="flex h-[calc(100vh-56px)] flex-col">
      {/* Панель управления */}
      <div className="flex flex-wrap items-center gap-4 border-b p-3 text-sm">
        {/* Переключатель режима */}
        <div className="flex gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-md px-3 py-1.5 ${mode === m.id ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {/* Ползунок в логарифмической шкале: от 10^3 (1 000) до 10^6.3 (~2 млн).
            Так управление одинаково удобно и на тысячах, и на миллионах. */}
        <label className="flex items-center gap-2">
          Points: <b className="tabular-nums">{requested.toLocaleString()}</b>
          <input
            type="range"
            min={3}
            max={6.3}
            step={0.05}
            value={Math.log10(requested)}
            onChange={(e) => setRequested(Math.round(10 ** Number(e.target.value)))}
          />
        </label>
        {/* FPS: зелёный от 50, жёлтый от 25, иначе красный */}
        <span className={`font-mono text-base ${fps >= 50 ? "text-green-600" : fps >= 25 ? "text-amber-600" : "text-red-600"}`}>
          {fps} FPS
        </span>
        {/* Предупреждение, если запрос превышает лимит режима */}
        {count < requested && (
          <span className="text-amber-600">
            {current.label} capped at {current.max.toLocaleString()} (rendering {count.toLocaleString()})
          </span>
        )}
      </div>
      {/* Область рисования. min-h-0 нужен, чтобы flex-child мог сжиматься и не растягивал страницу. */}
      <div className="min-h-0 flex-1">
        {/* key={count}: при смене числа точек DOM и WebGL пересоздаются
            (нужно новое число div'ов / новая геометрия). Canvas 2D просто читает count в цикле. */}
        {mode === "dom" && <DomPoints key={count} data={data} count={count} />}
        {mode === "canvas2d" && <Canvas2DPoints data={data} count={count} />}
        {mode === "webgl" && <WebGLPoints key={count} data={data} count={count} />}
      </div>
    </div>
  );
}
