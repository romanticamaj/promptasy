/**
 * Promptasy — 畫面成本稽核（v1.2 · P22b）
 *
 * **為什麼會有這一支。**
 * 這個專案從 v1 起就在守三個預算：三角形、光源、碰撞體。每一格都逐項驗、超了就紅。
 * 可是站長實玩之後說「畫面變卡了」，量下來才發現：**守的是錯的東西**。
 *
 * 用這一支回頭量兩個 tag（同一份程式碼、同一個世界）：
 *
 *   閘門 C → 閘門 D：三角形 220,600 → 229,644（**+4%**，一路都在框內）
 *                     draw call  3,562 → 4,144（**+16%**）
 *                     透明片     1,126 → 1,460（**+30%**）
 *                     加色混合     908 → 1,164（**+28%**）
 *                     材質       1,690 → 2,118（**+25%**）
 *
 * 23 萬個三角形對 GPU 來說是小事；**4,000 個 draw call ＋ 1,100 個要逐幀深度排序的
 * 加色混合透明片**才是真正的成本。它們一格就長了三成，而**沒有任何一條斷言在數它們**，
 * 所以每一格都誠實地報「預算綠燈」。
 * （閘門 B 量不到：那個 tag 缺後來才有的資料檔，世界蓋不起來。）
 *
 * 這一支就是那幾個數字的體溫計：
 *   · **draw call**：每一個 mesh／sprite／points 各算一次（InstancedMesh 算一次）。
 *     材質不同就不可能被合批，所以**材質數**幾乎就是 draw call 的下限。
 *   · **透明片**：不寫深度、要逐幀由遠到近排序；加色混合還會 overdraw。
 *   · **材質／幾何**：各自獨立就各自綁一次 shader、上傳一次 uniform。
 *
 * 用法：
 *   npm run audit:perf            高低畫質各一份總表 ＋ 逐層拆解
 *   npm run audit:perf -- --json  給 test:rubric 吃的機器可讀輸出
 *
 * **它只量「畫之前就決定好」的成本**（場景圖的形狀），不量幀時 ——
 * 幀時在這台軟體渲染的機器上量不準（findings：從外面量會遊走的東西是很吵的代理量）。
 * 場景圖的形狀是確定性的，所以它適合當契約。
 */
import { buildWorld } from './world-harness.mjs';

/** 一個物件屬於哪一層（往上找最近的、有名字的祖先）。 */
const LAYER_RE =
  /^(murk|watch|guardian|echo|archive|secret|react|handle|screens|drift|platform|marker|tablet|letter|shrine|gate|bridge|terrain|prop|vignette|star|moon|aurora|shortcut|finale|mother|ins|rubricfx)/i;

function layerOf(obj) {
  let node = obj;
  let best = 'other';
  while (node) {
    const name = node.name || '';
    if (LAYER_RE.test(name)) best = name.split(':')[0];
    node = node.parent;
  }
  return best;
}

/** 這一個 mesh 畫幾個三角形（instanced 要乘上實例數）。 */
function trisOf(obj) {
  const g = obj.geometry;
  if (!g) return 0;
  const n = g.index ? g.index.count / 3 : g.attributes.position ? g.attributes.position.count / 3 : 0;
  return n * (obj.isInstancedMesh ? obj.count : 1);
}

/**
 * 掃一棵場景圖，回一份畫面成本。
 * @param {object} root
 * @param {object} THREE
 */
export function perfOf(root, THREE) {
  const layers = new Map();
  const mats = new Set();
  const geos = new Set();
  const total = { draws: 0, transparent: 0, additive: 0, tris: 0, lights: 0, instanced: 0 };

  const bump = (key) => {
    let row = layers.get(key);
    if (!row) {
      row = { draws: 0, transparent: 0, additive: 0, tris: 0, mats: new Set() };
      layers.set(key, row);
    }
    return row;
  };

  root.traverse((obj) => {
    if (obj.isLight) total.lights += 1;
    if (!(obj.isMesh || obj.isSprite || obj.isPoints)) return;
    /*
     * 看不見的東西不算：`visible === false` 的整組（低畫質關掉的層、還沒立起來的母碑）
     * 在 three.js 的渲染迴圈裡連走都不會走到，算進來會讓低畫質看起來比實際貴。
     */
    let hidden = false;
    for (let n = obj; n; n = n.parent) {
      if (n.visible === false) {
        hidden = true;
        break;
      }
    }
    if (hidden) return;

    const row = bump(layerOf(obj));
    row.draws += 1;
    total.draws += 1;
    if (obj.isInstancedMesh) total.instanced += 1;

    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (mat) {
      mats.add(mat.uuid);
      row.mats.add(mat.uuid);
      if (mat.transparent) {
        row.transparent += 1;
        total.transparent += 1;
      }
      if (THREE && mat.blending === THREE.AdditiveBlending) {
        row.additive += 1;
        total.additive += 1;
      }
    }
    if (obj.isMesh) {
      if (obj.geometry) geos.add(obj.geometry.uuid);
      const t = trisOf(obj);
      row.tris += t;
      total.tris += t;
    }
  });

  total.tris = Math.round(total.tris);
  total.mats = mats.size;
  total.geos = geos.size;
  return {
    total,
    layers: [...layers.entries()]
      .map(([id, r]) => ({ id, draws: r.draws, transparent: r.transparent, additive: r.additive, tris: Math.round(r.tris), mats: r.mats.size }))
      .sort((a, b) => b.draws - a.draws),
  };
}

/** 高低畫質各量一次。 */
export async function perfAudit() {
  const out = {};
  for (const quality of ['high', 'low']) {
    const { world, THREE } = await buildWorld({ quality });
    out[quality] = perfOf(world.root, THREE);
  }
  return out;
}

/* --- CLI ---------------------------------------------------------- */
if (import.meta.url === `file://${process.argv[1]}`) {
  const audit = await perfAudit();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    for (const quality of ['high', 'low']) {
      const { total, layers } = audit[quality];
      console.log(`\n▸ ${quality === 'high' ? '高畫質' : '低畫質'}`);
      console.log(
        `  draw call ${total.draws}　材質 ${total.mats}　幾何 ${total.geos}　` +
          `透明片 ${total.transparent}（加色 ${total.additive}）　三角 ${total.tris.toLocaleString()}　光源 ${total.lights}`
      );
      console.log('  ' + '層'.padEnd(16) + 'draw'.padStart(7) + '材質'.padStart(7) + '透明'.padStart(7) + '加色'.padStart(7) + '三角'.padStart(10));
      for (const l of layers.slice(0, 12)) {
        console.log(
          '  ' +
            l.id.padEnd(16) +
            String(l.draws).padStart(7) +
            String(l.mats).padStart(7) +
            String(l.transparent).padStart(7) +
            String(l.additive).padStart(7) +
            String(l.tris).padStart(10)
        );
      }
    }
    console.log('\n（`--json` 給機器讀；這一支只量場景圖的形狀，不量幀時 —— 幀時在軟體渲染上量不準）');
  }
}

export default { perfAudit, perfOf };
