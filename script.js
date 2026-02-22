// const
const menuParent = document.querySelector(".menu")
const paramParent = document.querySelector(".param tbody")
const memoryParent = document.querySelector(".memory tbody")
const asmParent = document.querySelector(".asm tbody")
const textOutput = document.querySelector(".output")
const textLog = document.querySelector(".log")
const ioOUTAParent = document.querySelector("table.ioa tbody tr:nth-child(3)")
const ioINAParent = document.querySelector("table.ioa tbody tr:nth-child(2)")

const ioOUTBParent = document.querySelector("table.iob tbody tr:nth-child(3)")
const ioINBParent = document.querySelector("table.iob tbody tr:nth-child(2)")

let notSave = false;

const syntax = {
    ops: [
        "#string",
        "adc",
        "add",
        "and",
        "call",
        "cmp",
        "dec",
        "inc",
        "jc",
        "jmp",
        "jnc",
        "jnz",
        "jz",
        "lsl",
        "lsr",
        "mov",
        "mul",
        "neg",
        "not",
        "or",
        "printc",
        "printn",
        "push",
        "ret",
        "sbc",
        "sub",
        "xor",
    ],
    op: {
        runnerOp: ["#define", "#string"],
        take0p: ["ret"],
        take1p: ["inc", "dec", "neg", "not", "lsr", "lsl"],
        take1pORv: ["printn", "printc", "push",],
        take2p: ["mov", "add", "adc", "cmp", "mul", "sub", "sbc", "and", "or", "xor",],
        take1l: ["jz", "jnz", "jc", "jnc", "jmp", "call"],
    },
    regexp: {
        cInt: /#(0x[0-9A-F]+|(\d+))/,
        cAscii: /"."/,
        var: /0x[0-9A-F]+/,
        vPoint: /\*0x[0-9A-F]+/,
        label: /.*:/,
    }
}

const param = {
    /**
     * @typedef {"DT"|"RC"|"PC"|"ZF"|"CF"|"SP"} paramkey
     * 
     * @type {{[k in paramkey]:{
     * value: number;
     * name: string;
     * oninput: function;
     * input: HTMLInputElement;
     * }}}
     */
    params: {
        DT: { value: 0, name: "実行遅延", oninput(v) { param.params.DT.value = v } },
        RC: { value: 0, name: "総実行数", oninput(v) { param.params.RC.value = v } },
        PC: {
            value: 0, name: "プログラムカウンタ", oninput(v) {
                param.params.PC.value = v;
                asm.focus(v);
            }
        },
        ZF: { value: 0, name: "ゼロフラグ", oninput(v) { param.params.ZF.value = v } },
        CF: { value: 0, name: "キャリーフラグ", oninput(v) { param.params.CF.value = v } },
        SP: {
            value: 255, name: "スタックポインタ", oninput(v) {
                param.params.SP.value = v;
                memory.stackFocus(v);
            }
        },
    },
    update() {
        Object.values(this.params).forEach(e => {
            e.input.value = e.value;
        });
        this.save();
    },
    init() {
        try {
            const load = JSON.parse(localStorage.getItem("param") || "{}")
            Object.keys(load).forEach(k => {
                this.params[k].value = load[k];
            })
        } catch (_) {

        }
        Object.values(this.params).forEach(e => {
            e.input = this.createParamInputRow(e);
        })
    },
    save() {
        if (notSave) {
            return;
        }
        const param = {};
        Object.keys(this.params).forEach(k => {
            param[k] = this.params[k].value;
        })
        localStorage.setItem("param", JSON.stringify(param))
    },
    /**
     * テーブルの行(tr)を作成して返す
     * @param {{name:string, value:number, oninput:function}}
     * @returns {HTMLInputElement} 
     */
    createParamInputRow({ name, value, oninput }) {
        // 1. 各要素の生成
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        const td = document.createElement('td');
        const input = document.createElement('input');

        // 2. 内容と属性の設定
        th.textContent = name;
        input.type = 'number';
        input.value = value;

        // 3. イベントリスナーの登録
        if (oninput) {
            input.addEventListener('input', () => {
                // 数値としてコールバックに渡す
                oninput(Number(input.value) || 0);
                this.save();
            });
        }

        // 4. 組み立て
        td.appendChild(input);
        tr.appendChild(th);
        tr.appendChild(td);

        paramParent.appendChild(tr);
        return input;
    }
}
param.init();

const memory = {
    value: new Uint8Array(256),
    focus(addr) {
        const old = memoryParent.querySelector(".select")
        if (old) old.classList.remove("select");
        if (addr !== -1) {
            this.cells[addr][0].classList.add("select");
        }
    },
    stackFocus(addr) {
        const old = memoryParent.querySelector(".stack")
        if (old) old.classList.remove("stack");
        if (addr !== -1) {
            this.cells[addr][0].classList.add("stack");
        }
    },
    /**
     * @type {[HTMLTableDataCellElement,HTMLInputElement,HTMLInputElement][]}
     */
    cells: [],
    init() {
        try {
            const load = JSON.parse(localStorage.getItem("memory") || "[]")
            this.value.set(load);
        } catch { }
        this.createMemory256DoubleInputCell();
        this.update();
    },
    update() {
        for (let i = 0; i < 256; i++) {
            const v = this.value[i];
            const [d, n, s] = this.cells[i];
            if (v === 0) {
                d.classList.remove("using");
                n.value = "00";
                s.value = ".";
            } else if (Number(n.value) !== v) {
                d.classList.remove("using");
                d.classList.add("using");
                n.value = v.toString(16).padStart(2, "0").toUpperCase();
                if (v >= 32 && v <= 126) {
                    s.value = String.fromCharCode(v);
                } else {
                    s.value = ".";
                }
            }
        }
        this.save();
    },
    save() {
        if (notSave) {
            return;
        }
        localStorage.setItem("memory", JSON.stringify(Array.from(memory.value)));
    },
    createMemory256DoubleInputCell() {
        const syncListener = (addr, input1) => {
            this.value[addr] = parseInt(input1.value, 16) || 0;
            this.update();
        }
        const syncAsciiListener = (addr, input2) => {
            if (input2.value === ".") {
                return;
            }
            if (!input2.value) {
                return;
            }
            input2.value = input2.value[0];
            this.value[addr] = input2.value.charCodeAt() || 0;
            this.update();
        }
        for (let j = 0; j < 16; j++) {
            const tr = document.createElement('tr');
            const th = document.createElement('th');
            th.textContent = j.toString(16).toUpperCase() + "0";
            tr.appendChild(th);
            for (let i = 0; i < 16; i++) {
                const td = document.createElement('td');
                const input1 = document.createElement('input');
                const input2 = document.createElement('input');
                this.cells[16 * j + i] = [td, input1, input2];
                // inputの設定
                input1.type = 'text';
                input2.type = 'text';
                input1.addEventListener('focusin', () => {
                    input1.select();
                    this.focus(this.value[16 * j + i]);
                });
                input2.addEventListener('focusin', input2.select.bind(input2));
                input1.addEventListener('focusout', syncListener.bind(window, 16 * j + i, input1));
                input2.addEventListener('focusout', syncAsciiListener.bind(window, 16 * j + i, input2));
                // 組み立て
                td.appendChild(input1);
                td.appendChild(input2);
                tr.appendChild(td);
            }
            memoryParent.appendChild(tr);
        }
    }
}
memory.init();

const asm = {
    defines: {},
    /**
     * @type {[string,string,string][]}
     */
    ops: [],
    /**
     * @type {[HTMLTableHeaderCellElement,HTMLTextAreaElement,HTMLTextAreaElement,HTMLTextAreaElement,HTMLTableRowElement][]}
     */
    cells: [],
    /**
     * @param {string} s 
     */
    type(s) {
        if (!s) return "null";
        else if (syntax.regexp.label.test(s)) return "l";
        else if (syntax.regexp.cAscii.test(s)) return "v";
        else if (syntax.regexp.cInt.test(s)) return "v";
        else if (syntax.regexp.vPoint.test(s)) return "p";
        else if (syntax.regexp.var.test(s)) return "p";
        return "notype";
    },
    /**
     * @param {string} s 
     */
    typex(s) {
        if (!s) return "n";
        else if (syntax.regexp.cAscii.test(s)) return "c";
        else if (syntax.regexp.cInt.test(s)) return "c";
        else if (syntax.regexp.vPoint.test(s)) return "p";
        else if (syntax.regexp.var.test(s)) return "v";
        return "n";
    },
    focus(pos = -1) {
        const old = asmParent.querySelector(".select");
        if (old) old.classList.remove("select");
        if (pos !== -1 && this.cells[pos]) {
            this.cells[pos][4].classList.add("select");
        }
    },
    /**
     * @type {HTMLDivElement}
     */
    sug: asmParent.querySelector(".sug"),
    sugTarget: null,
    init() {
        try {
            const load = JSON.parse(localStorage.getItem("asm") || "[]");
            if (!load.length) {
                throw 0;
            }
            load.forEach((e, i) => this.createAsmInputRow(i, ...e));
            this.save();
        } catch {
            this.createAsmInputRow();
            this.createAsmInputRow();
            this.createAsmInputRow();
        }
        this.fixTH();
        this.focus(param.params.PC.value);
        this.sug.style.display = "none";
        this.sug.childNodes.forEach(e => {
            e.addEventListener("pointerdown", () => {
                console.log(e.textContent);
                if (this.sugTarget) {
                    this.sugTarget.value = e.textContent;
                    const s = this.sugTarget;
                    setTimeout(() => s.focus());
                }
            })
        })
    },
    /**
     * @param {HTMLInputElement} input 
     * @param {HTMLTableCellElement} td
     */
    suggest(input, td) {
        this.sugTarget = input;
        td.appendChild(this.sug);
        this.sug.style.display = "block";
        const v = input.value;
        let i = 0;
        for (i = 0; i < syntax.ops.length; i++) {
            if (syntax.ops[i] >= v) {
                console.log(i, v, syntax.ops[i]);
                break;
            }
        }
        this.sug.scroll(0, i * 27);
    },
    unsuggest() {
        this.sugTarget = null;
        this.sug.style.display = "none";
    },
    fixTH() {
        this.cells.forEach((e, i) => {
            e[0].textContent = i;
        })
    },
    createAsmInputRow(at = 0, op = "", p1 = "", p2 = "") {
        // 1. 各要素の生成
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        const td1 = document.createElement('td');
        const td2 = document.createElement('td');
        const td3 = document.createElement('td');
        const input1 = document.createElement('textarea');
        const input2 = document.createElement('textarea');
        const input3 = document.createElement('textarea');

        const ops = [op, p1, p2];
        const cells = [th, input1, input2, input3, tr];
        // 2. 内容と属性の設定
        th.textContent = at;
        input1.addEventListener("keydown", this.onkeydown.bind(this, input1, 0, ops));
        input2.addEventListener("keydown", this.onkeydown.bind(this, input2, 1, ops));
        input3.addEventListener("keydown", this.onkeydown.bind(this, input3, 2, ops));
        input1.addEventListener("paste", this.onpaste.bind(this, input1, 0, ops));
        input2.addEventListener("paste", this.onpaste.bind(this, input2, 1, ops));
        input3.addEventListener("paste", this.onpaste.bind(this, input3, 2, ops));
        input1.addEventListener("input", this.onupdate.bind(this, input1, 0, ops, cells));

        input1.addEventListener("input", this.suggest.bind(this, input1, td1));
        input1.addEventListener("focusout", this.unsuggest.bind(this));

        input2.addEventListener("input", this.onupdate.bind(this, input2, 1, ops, cells));
        input3.addEventListener("input", this.onupdate.bind(this, input3, 2, ops, cells));
        input1.addEventListener("focus", this.onupdate.bind(this, input1, 0, ops, cells));
        input2.addEventListener("focus", this.onupdate.bind(this, input2, 1, ops, cells));
        input3.addEventListener("focus", this.onupdate.bind(this, input3, 2, ops, cells));
        input1.value = op;
        input2.value = p1;
        input3.value = p2;
        if (op || p1 || p2) {
            this.onupdate(input1, 0, ops, cells);
            this.onupdate(input2, 1, ops, cells);
            this.onupdate(input3, 2, ops, cells);
        }
        // 4. 組み立て
        td1.appendChild(input1);
        td2.appendChild(input2);
        td3.appendChild(input3);
        tr.appendChild(th);
        tr.appendChild(td1);
        tr.appendChild(td2);
        tr.appendChild(td3);

        const referenceNode = asmParent.children[at + 1];
        // referenceNodeがundefined（末尾）でなければ挿入、なければ末尾に追加
        if (referenceNode) {
            asmParent.insertBefore(tr, referenceNode);
        } else {
            asmParent.appendChild(tr); // インデックスが範囲外の場合は末尾
        }

        this.cells.splice(at, 0, cells);
        this.ops.splice(at, 0, ops);
    },
    /**
    * @param {HTMLInputElement} input
    * @param {number} type
    * @param {[string, string, string]} ops
    * @param {[HTMLTableHeaderCellElement,HTMLInputElement,HTMLInputElement,HTMLInputElement,HTMLTableRowElement]} cells
    */
    onupdate(input, type, ops, cells) {
        const pos = this.ops.indexOf(ops);
        if (pos === -1 && !cells) {
            return;
        } else if (!cells) {
            cells = this.cells[pos];
        }

        ops[type] = input.value;

        this.save();

        if (!input.value) {
            input.className = "";
            return;
        }

        if (type === 0) {
            cells[1].disabled = false;
            cells[2].disabled = false;
            cells[3].disabled = false;
            if (syntax.regexp.label.test(input.value)) {
                input.className = "label";
                cells[2].disabled = true;
                cells[3].disabled = true;
                ops[1] = ops[2] = "";
            } else if (syntax.op.take0p.includes(input.value)) {
                input.className = "op";
                cells[2].disabled = true;
                cells[3].disabled = true;
                ops[1] = ops[2] = "";
            } else if (syntax.op.take1l.includes(input.value)) {
                input.className = "op";
                cells[3].disabled = true;
                ops[2] = "";
                if (this.type(ops[1]) !== "notype") {
                    cells[2].className = "wrong";
                }
            } else if (syntax.op.take1p.includes(input.value)) {
                input.className = "op";
                cells[3].disabled = true;
                ops[2] = "";
                if (this.type(ops[1]) !== "p") {
                    cells[2].className = "wrong";
                }
            } else if (syntax.op.take1pORv.includes(input.value)) {
                input.className = "op";
                cells[3].disabled = true;
                ops[2] = "";
                if (this.type(ops[1]) !== "v" && this.type(ops[1]) !== "p") {
                    cells[2].className = "wrong";
                }
            } else if (syntax.op.take2p.includes(input.value)) {
                input.className = "op";
                if (this.type(ops[1]) !== "p") {
                    cells[2].className = "wrong";
                }
                if (this.type(ops[2]) !== "v" && this.type(ops[2]) !== "p") {
                    cells[3].className = "wrong";
                }
            } else if (syntax.op.runnerOp.includes(input.value)) {
                input.className = "rop";
                if (this.type(ops[2]) !== "p") {
                    cells[3].className = "wrong";
                }
            } else input.className = "wrong";
        } else {
            if (syntax.regexp.cAscii.test(input.value)) input.className = "ascii";
            else if (syntax.regexp.cInt.test(input.value)) input.className = "int";
            else if (syntax.regexp.vPoint.test(input.value)) {
                memory.focus(parseInt(input.value.substring(1), 16));
                input.className = "point";
            } else if (syntax.regexp.var.test(input.value)) {
                memory.focus(parseInt(input.value, 16));
                input.className = "var";
            } else {
                const label = this.ops.findIndex(v => v[0] === input.value + ":")
                if (label === -1) {
                    input.className = "wrong";
                } else {
                    input.className = "label";
                    this.focus(label);
                }
            }
        }
    },

    /**
     * @param {HTMLInputElement} input
     * @param {number} type
     * @param {[string, string, string]} ops
     * @param {KeyboardEvent} k
     */
    onkeydown(input, type, ops, k) {
        const pos = this.ops.indexOf(ops);
        if (pos === -1) {
            return;
        }

        switch (k.code) {
            case "Enter":
                this.createAsmInputRow(pos + 1);
                this.fixTH();
                this.cells[pos + 1][type + 1]?.focus();
                k.preventDefault();
                break;
            case "ArrowDown":
                this.cells[pos + 1][type + 1]?.focus();
                k.preventDefault();
                break;
            case "ArrowUp":
                this.cells[pos - 1][type + 1]?.focus();
                k.preventDefault();
                break;
            case "ArrowRight":
                if (input.selectionStart === input.value.length) {
                    this.cells[pos][(type + 1) % 3 + 1]?.focus();
                    k.preventDefault();
                    break;
                }
                break;
            case "Space":
                if (input.selectionStart === input.value.length) {
                    this.cells[pos][(type + 1) % 3 + 1]?.focus();
                    k.preventDefault();
                    break;
                }
                break;
            case "ArrowLeft":
                if (input.selectionStart === 0) {
                    this.cells[pos][(type + 2) % 3 + 1]?.focus();
                    k.preventDefault();
                    break;
                }
                break;
            case "Backspace":
                if (type === 0 && input.value.length === 0 && this.ops.length !== 1) {
                    asmParent.removeChild(this.cells[pos][4]);
                    this.cells[pos - 1][1]?.focus();
                    this.ops.splice(pos, 1);
                    this.cells.splice(pos, 1);
                    this.fixTH();
                    k.preventDefault();
                    break;
                } else if (input.value.length === 0) {
                    this.cells[pos][type]?.focus();
                    k.preventDefault();
                    break;
                }
                break;
            default:
                break;
        }
    },
    clear() {
        if (!confirm("本当にプログラムを消去しますか？")) {
            return;
        };
        for (let pos = 0; pos < this.ops.length; pos++) {
            asmParent.removeChild(this.cells[pos][4]);
        }
        this.ops = [];
        this.cells = [];
        this.createAsmInputRow();
        this.fixTH();
    },
    /**
     * @param {HTMLInputElement} input
     * @param {number} type
     * @param {[string, string, string]} ops
     * @param {ClipboardEvent} event
     */
    onpaste(input, type, ops, event) {
        const text = event.clipboardData.getData('text');
        if (!text.includes('\n')) {
            return; // 改行がなければ通常の貼り付け
        }

        event.preventDefault(); // デフォルトの貼り付けをキャンセル

        const lines = text.trim().split('\n');

        const pos = this.ops.indexOf(ops);
        if (pos === -1) {
            return;
        }

        // 1行目を現在の行に設定
        const firstLineParts = lines[0].split(/[\s,]+/);
        this.cells[pos][1].value = firstLineParts[0] || "";
        this.cells[pos][2].value = firstLineParts[1] || "";
        this.cells[pos][3].value = firstLineParts[2] || "";
        this.onupdate(this.cells[pos][1], 0, this.ops[pos]);
        this.onupdate(this.cells[pos][2], 1, this.ops[pos]);
        this.onupdate(this.cells[pos][3], 2, this.ops[pos]);


        // 2行目以降を新しい行として挿入
        let insertAt = pos + 1;
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(/[\s,]+/);
            this.createAsmInputRow(insertAt, parts[0], parts[1], parts[2]);
            insertAt++;
        }
        this.fixTH();
        this.cells[pos + lines.length]?.[1].focus(); // 次の行にフォーカス
    },
    save() {
        if (notSave) {
            return;
        }
        localStorage.setItem("asm", JSON.stringify(Array.from(asm.ops)));
    },
};
asm.init();


const DDRA = 1;
const PORTA = 3;
const PINA = 5;

const DDRB = 2;
const PORTB = 4;
const PINB = 6;

const io = {
    /**
     * @type {HTMLInputElement[]}
     */
    in: [],
    /**
     * @type {HTMLInputElement[]}
     */
    out: [],
    sync() {
        const _DDRA = memory.value[DDRA];
        const _DDRB = memory.value[DDRB];

        let [pina, pinb] = [0, 0];
        const data = this.in.map(e => e.checked)
        data.forEach((e, i) => {
            if (i < 8) {
                if (e) pina |= 1 << i;
            } else {
                if (e) pinb |= 1 << (i - 8);
            }
        })

        const [_PINA, _PINB] = [pina, pinb];
        const _PORTA = memory.value[PORTA];
        const _PORTB = memory.value[PORTB];

        for (let i = 0; i < 16; i++) {
            if (i < 8) {
                this.out[i].checked = !!(_PORTA & 1 << i);
            } else {
                this.out[i].checked = !!(_PORTB & 1 << (i - 8));
            }
        }

        memory.value[PINA] = (~_DDRA) & _PINA;
        memory.value[PINB] = (~_DDRB) & _PINB;
    },
    init() {
        for (let i = 0; i < 8; i++) {
            const td = document.createElement("td")
            const ch = document.createElement("input")
            ch.type = "checkbox";
            ch.readOnly = true;
            ch.addEventListener('click', (e) => {
                e.preventDefault();
            });
            ch.checked = true;
            this.out.push(ch);
            td.appendChild(ch);
            ioOUTAParent.appendChild(td);
        }
        for (let i = 0; i < 8; i++) {
            const td = document.createElement("td")
            const ch = document.createElement("input")
            ch.type = "checkbox";
            ch.readOnly = true;
            ch.addEventListener('click', (e) => {
                e.preventDefault();
            });
            ch.checked = true;
            this.out.push(ch);
            td.appendChild(ch);
            ioOUTBParent.appendChild(td);
        }
        for (let i = 0; i < 8; i++) {
            const td = document.createElement("td")
            const ch = document.createElement("input")
            ch.type = "checkbox";
            this.in.push(ch);
            td.appendChild(ch);
            ioINAParent.appendChild(td);
        }
        for (let i = 0; i < 8; i++) {
            const td = document.createElement("td")
            const ch = document.createElement("input")
            ch.type = "checkbox";
            this.in.push(ch);
            td.appendChild(ch);
            ioINBParent.appendChild(td);
        }
    }
}
io.init();

const menu = {
    /**
     * @type {{
     * name: string,
     * cb: ()=>void,
     * }[]
     * }
     */
    menus: [
        {
            name: "STEP", cb: () => {
                runstop = false;
                runCPU(true);
            }
        },
        {
            name: "RUN", cb: () => {
                runstop = false;
                runCPU();
            }
        },
        {
            name: "STOP", cb: () => {
                runstop = true;
                notSave = false;
            }
        },
        {
            name: "RUN*", cb: () => {
                runstop = false;
                runCPUFast();
            }
        },
        {
            name: "MCLR", cb: () => {
                memory.value.fill(0);
                memory.update();
                param.params.CF.value = 0;
                param.params.PC.value = 0;
                param.params.RC.value = 0;
                param.params.SP.value = 255;
                param.params.ZF.value = 0;
                param.update();
                textLog.value = "";
                textOutput.value = "";
            }
        },
        {
            name: "CCLR", cb: () => {
                asm.clear();
            }
        },
        {
            name: "DOCS", cb: () => {
                if (!menu.docs || menu.docs.closed) {
                    if (window.iscached) {
                        menu.docs = open();
                        fetch("./docs.html").then(r => r.text()).then(t => {
                            menu.docs.document.body.innerHTML = t;
                        });
                    } else {
                        menu.docs = open("./docs.html");
                    }

                }
                menu.docs.focus();
            }
        },
        { name: "LOAD", cb: load },
        { name: "SAVE", cb: save },
        {
            name: "COPY", cb: () => {
                const ta = document.createElement("textarea");
                ta.textContent = asm.ops.map(e => e.join(",")).join("\n");
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
        }
    ],
    init() {
        this.menus.forEach(e => {
            const bt = document.createElement("button");
            bt.type = "button";
            bt.addEventListener("click", e.cb);
            bt.textContent = e.name;
            menuParent.appendChild(bt);
        });
        /**
         * @type {HTMLSelectElement}
         */
        const menuExample = menuParent.querySelector(".example");
        menuExample.addEventListener("input", (e) => {
            if (!menuExample.value) {
                return;
            }
            if (!confirm("現在の内容を書き換えますか？")) {
                menuExample.value = "";
                e.preventDefault();
                return;
            }
            fetch("./example/" + menuExample.value).then(r => r.text()).then(t => {
                const [vasm, vmemory, vparam] = t.split("\n");
                localStorage.setItem("asm", vasm);
                localStorage.setItem("memory", vmemory);
                localStorage.setItem("param", vparam);

                if (window.iscached) {
                    fetch("./index2.html").then(r => r.text()).then(t => {
                        const w = open();
                        w.$$cached = $$cached;
                        w.document.write(t);
                        w.document.close();
                        close();
                    });
                } else {
                    location.reload();
                }
            })
        })
    },
    /**
     * @type {Window}
     */
    docs: null,
}
menu.init();

function getVal(operand, memArray) {
    if (typeof operand !== 'string' || operand === "") return 0;
    if (operand.startsWith('#')) return parseInt(operand.slice(1)); // #10 -> 10
    if (operand.startsWith('"')) return operand.charCodeAt(1);      // "A" -> 65
    if (operand.startsWith('*')) {                                  // *0x10 (間接参照)
        const ptrAddr = parseInt(operand.slice(1), 16);
        const realAddr = memArray[ptrAddr];
        return memArray[realAddr];
    }
    if (operand.startsWith('0x')) return memArray[parseInt(operand, 16)]; // 0x10 -> メモリの値
    return 0;
}

function getBal(operand) {
    if (typeof operand !== 'string' || operand === "") return 0;
    if (operand.startsWith('#')) return parseInt(operand.slice(1)); // #10 -> 10
    if (operand.startsWith('"')) return operand.charCodeAt(1);      // "A" -> 65
    if (operand.startsWith('*')) {                                  // *0x10 (間接参照)
        const ptrAddr = parseInt(operand.slice(1), 16);
        return ptrAddr
    }
    if (operand.startsWith('0x')) return parseInt(operand, 16); // 0x10 -> メモリの値
    return 0;
}

let logs = [];

let runstop = false;

/**
 * コアロジック：CPUの実行
 */
function runCPU(is1step = false) {
    if (runstop) {
        return;
    }
    let currentOutput = textOutput.value;
    io.sync();
    asm.save();

    const codeData = asm.ops;

    // ラベルのプリスキャン（JMP先を探すため）
    const labels = {};
    codeData.forEach((row, idx) => {
        if (row[0] && row[0].toString().endsWith(':')) {
            labels[row[0].toString().replace(':', '')] = idx;
        }
    });

    const memoryArray = memory.value;

    let pc = param.params.PC.value;
    let zf = param.params.ZF.value;
    let cf = param.params.CF.value;
    let ct = param.params.RC.value;
    let sp = param.params.SP.value;
    const delay = param.params.DT.value || 1;
    // 2. 実行ループ
    const run = () => {
        while ((pc < codeData.length) || !runstop) {

            param.params.PC.value = pc
            param.params.ZF.value = zf
            param.params.CF.value = cf
            param.params.RC.value = ct
            param.params.SP.value = sp
            textOutput.value = currentOutput;
            logs = logs.slice(-80);
            textLog.value = logs.join("\n");
            io.sync();
            memory.update();
            memory.stackFocus(sp);

            param.update();
            if (pc >= codeData.length) {
                pc = 0;
                param.params.PC.value = pc
                logs.push(`end of program.`);
                break;
            }
            asm.focus(pc);

            let [op, arg1, arg2] = codeData[pc];
            if (!op || op.toString().endsWith(':')) { pc++; if (is1step) { break; } continue; }

            op = op.toLowerCase();
            let lastResult = null;

            let addr = 0;
            if (arg1 && arg1[0] === "*") {
                addr = memoryArray[parseInt(arg1.slice(1), 16)];
            } else if (parseInt(arg1, 16)) {
                addr = parseInt(arg1, 16);
            }

            ct++;
            logs.push(`L${pc} ${op} ${arg1} ${arg2}`);

            // 命令デコード
            switch (op) {
                case '#string':
                    var bf = new TextEncoder().encode(arg1);
                    memoryArray.set(bf, parseInt(arg2, 16));
                    memoryArray[parseInt(arg2, 16) + bf.length] = 0;
                    ct--;
                    break;
                case 'mov':
                    var val = getVal(arg2, memoryArray);

                    memoryArray[addr] = val;
                    break;

                case 'add':
                    var val = getVal(arg2, memoryArray);
                    var result = memoryArray[addr] + val;
                    memoryArray[addr] = result % 256;
                    cf = (result > 255) ? 1 : 0;
                    lastResult = memoryArray[addr];
                    break;

                case 'adc': // キャリー付き加算
                    var srcVal = getVal(arg2, memoryArray);
                    // 現在のCF(0か1)も含めて加算
                    var result = memoryArray[addr] + srcVal + cf;

                    cf = (result > 255) ? 1 : 0; // 新たな桁上がりを保存
                    memoryArray[addr] = result % 256;
                    lastResult = memoryArray[addr];
                    break;

                case 'mul':
                    memoryArray[addr] = (memoryArray[addr] * getVal(arg2, memoryArray)) % 256;

                    lastResult = memoryArray[addr];
                    break;

                case 'inc':
                    memoryArray[addr] = (memoryArray[addr] + 1) % 256;

                    lastResult = memoryArray[addr];
                    break;

                case 'cmp':
                    lastResult = memoryArray[addr] - getVal(arg2, memoryArray);
                    cf = (memoryArray[addr] < getVal(arg2, memoryArray)) ? 1 : 0;

                    break;

                case 'jz':

                    if (zf === 1) { pc = labels[arg1]; if (is1step) break; continue; }
                    break;

                case 'jnz':

                    if (zf === 0) { pc = labels[arg1]; if (is1step) break; continue; }
                    break;

                case 'jc': // キャリーがあればジャンプ
                    if (cf === 1) {
                        pc = labels[arg1];
                        if (is1step) { break; } continue; // PCを更新したのでループの先頭へ
                    }
                    break;

                case 'jnc': // キャリーがなければジャンプ（これもセットであると便利です）
                    if (cf === 0) {
                        pc = labels[arg1];
                        if (is1step) { break; } continue;
                    }
                    break;

                case 'jmp':

                    pc = labels[arg1];
                    if (is1step) { break; } continue;

                case 'printn':
                    currentOutput += getVal(arg1, memoryArray).toString();
                    break;

                case 'printc':
                    currentOutput += String.fromCharCode(getVal(arg1, memoryArray));
                    break;

                case 'sub':
                    var srcVal = getVal(arg2, memoryArray);
                    var result = memoryArray[addr] - srcVal;

                    // キャリーフラグ(借位)の判定：引く数の方が大きければCF=1
                    cf = (memoryArray[addr] < srcVal) ? 1 : 0;

                    memoryArray[addr] = (result + 256) % 256; // 8bit範囲に収める
                    lastResult = memoryArray[addr];
                    break;

                case 'not':
                    // JavaScriptのビット反転「~」は32ビットで行われるため、
                    // 最後に 0xFF (1111 1111) と AND を取って 8ビットに切り出します
                    memoryArray[addr] = (~memoryArray[addr]) & 0xFF;
                    lastResult = memoryArray[addr];
                    break;

                case 'and':
                    memoryArray[addr] &= getVal(arg2, memoryArray);
                    lastResult = memoryArray[addr];
                    break;

                case 'or':
                    memoryArray[addr] |= getVal(arg2, memoryArray);
                    lastResult = memoryArray[addr];
                    break;

                case 'xor':
                    memoryArray[addr] ^= getVal(arg2, memoryArray);
                    lastResult = memoryArray[addr];
                    break;

                case 'lsl': // 左論理シフト (2倍)
                    var result = memoryArray[addr] << 1;
                    cf = (result > 255) ? 1 : 0; // 溢れたビットをCFへ
                    memoryArray[addr] = result % 256;
                    lastResult = memoryArray[addr];
                    break;

                case 'lsr': // 右論理シフト (1/2)
                    cf = (memoryArray[addr] & 0x01); // 追い出される一番右のビットをCFへ
                    memoryArray[addr] >>= 1;
                    lastResult = memoryArray[addr];
                    break;

                case 'sbc': // キャリー（ボロー）付き減算
                    var srcVal = getVal(arg2, memoryArray);
                    var result = memoryArray[addr] - srcVal - cf;
                    cf = (memoryArray[addr] < (srcVal + cf)) ? 1 : 0;
                    memoryArray[addr] = (result + 256) % 256;
                    lastResult = memoryArray[addr];
                    break;

                case 'neg': // 2の補数（符号反転）
                    memoryArray[addr] = ((~memoryArray[addr] + 1) & 0xFF);
                    lastResult = memoryArray[addr];
                    break;

                case 'dec': // デクリメント (-1)
                    memoryArray[addr] = (memoryArray[addr] - 1 + 256) % 256;
                    lastResult = memoryArray[addr];
                    break;

                case 'call': // 関数呼び出し
                    // 戻り先アドレス（現在のPC+1）をスタックに保存
                    memoryArray[sp] = pc + 1;
                    sp--;
                    pc = labels[arg1];
                    if (is1step) { break; } continue;

                case 'ret': // 関数から復帰
                    sp++;
                    pc = memoryArray[sp];
                    console.log("RET", pc, sp, is1step);

                    if (is1step) { pc--; break; } continue;

                case 'push': // スタックへ値を保存
                    var val = getVal(arg1, memoryArray);
                    memoryArray[sp] = val;
                    sp--;
                    break;

                case 'pop': // スタックから値を取り出す
                    sp++;
                    memoryArray[addr] = memoryArray[sp];
                    lastResult = memoryArray[addr];
                    break;
                default:
                    ct--;
                    logs.push(`WARN: UNKNOWN OP`);
                    break;
            }

            // フラグ更新
            if (lastResult !== null) zf = (lastResult === 0) ? 1 : 0;
            if (Number.isNaN(lastResult)) zf = 1;
            pc++;

            if (is1step) break;
            if (delay) {
                break;
            }
        }
    }
    if (is1step) {
        run();
        if (pc >= codeData.length) {
            pc = 0;
            param.params.PC.value = pc;
            logs.push(`end of program.`);
        }
        param.params.PC.value = pc
        param.params.ZF.value = zf
        param.params.CF.value = cf
        param.params.RC.value = ct
        param.params.SP.value = sp
        textOutput.value = currentOutput;
        logs = logs.slice(-80);
        textLog.value = logs.join("\n");
        io.sync();
        memory.update();
        memory.stackFocus(sp);
        asm.focus(pc);
        param.update();
    } else {
        const f = () => setTimeout(() => {
            if (runstop) {
                return;
            }
            run();
            if (pc >= codeData.length) {
                pc = 0;
                param.params.PC.value = pc;
                logs.push(`end of program.`);
            }
            param.params.PC.value = pc
            param.params.ZF.value = zf
            param.params.CF.value = cf
            param.params.RC.value = ct
            param.params.SP.value = sp
            textOutput.value = currentOutput;
            logs = logs.slice(-80);
            textLog.value = logs.join("\n");
            io.sync();
            memory.update();
            memory.stackFocus(sp);
            asm.focus(pc);
            asm.save();
            param.update();

            if (pc === 0) {
                return;
            }

            f();
        }, (delay));
        f();
    }
}

/**
 * コアロジック：CPUの実行
 */
function runCPUFast() {
    if (runstop) {
        return;
    }
    notSave = true;
    let currentOutput = textOutput.value;
    io.sync();
    asm.save();

    const codeData = asm.ops;

    // ラベルのプリスキャン（JMP先を探すため）
    const labels = {};
    codeData.forEach((row, idx) => {
        if (row[0] && row[0].toString().endsWith(':')) {
            labels[row[0].toString().replace(':', '')] = idx;
        }
    });

    const memoryArray = memory.value;

    let pc = param.params.PC.value;
    let zf = param.params.ZF.value;
    let cf = param.params.CF.value;
    let ct = param.params.RC.value;
    let sp = param.params.SP.value;
    // 2. 実行ループ
    while ((pc < codeData.length) || !runstop) {

        if (ct > 10_000_000) {
            logs.push(`limit 10,000,000`);
            break;
        }

        if (pc >= codeData.length) {
            pc = 0;
            param.params.PC.value = pc
            logs.push(`end of program.`);
            break;
        }

        let [op, arg1, arg2] = codeData[pc];
        if (!op || op.toString().endsWith(':')) { pc++; continue; }

        op = op.toLowerCase();
        let lastResult = null;

        let addr = 0;
        if (arg1 && arg1[0] === "*") {
            addr = memoryArray[parseInt(arg1.slice(1), 16)];
        } else if (parseInt(arg1, 16)) {
            addr = parseInt(arg1, 16);
        }

        ct++;
        logs.push(`L${pc} ${op} ${arg1} ${arg2}`);

        // 命令デコード
        switch (op) {
            case '#string':
                var bf = new TextEncoder().encode(arg1);
                memoryArray.set(bf, parseInt(arg2, 16));
                memoryArray[parseInt(arg2, 16) + bf.length] = 0;
                ct--;
                break;

            case 'mov':
                var val = getVal(arg2, memoryArray);

                memoryArray[addr] = val;
                break;

            case 'add':
                var val = getVal(arg2, memoryArray);
                var result = memoryArray[addr] + val;
                memoryArray[addr] = result % 256;
                cf = (result > 255) ? 1 : 0;
                lastResult = memoryArray[addr];
                break;

            case 'adc': // キャリー付き加算
                var srcVal = getVal(arg2, memoryArray);
                // 現在のCF(0か1)も含めて加算
                var result = memoryArray[addr] + srcVal + cf;

                cf = (result > 255) ? 1 : 0; // 新たな桁上がりを保存
                memoryArray[addr] = result % 256;
                lastResult = memoryArray[addr];
                break;

            case 'mul':
                memoryArray[addr] = (memoryArray[addr] * getVal(arg2, memoryArray)) % 256;

                lastResult = memoryArray[addr];
                break;

            case 'inc':
                memoryArray[addr] = (memoryArray[addr] + 1) % 256;

                lastResult = memoryArray[addr];
                break;

            case 'cmp':
                lastResult = memoryArray[addr] - getVal(arg2, memoryArray);
                cf = (memoryArray[addr] < getVal(arg2, memoryArray)) ? 1 : 0;

                break;

            case 'jz':

                if (zf === 1) { pc = labels[arg1]; continue; }
                break;

            case 'jnz':

                if (zf === 0) { pc = labels[arg1]; continue; }
                break;

            case 'jc': // キャリーがあればジャンプ
                if (cf === 1) {
                    pc = labels[arg1];
                    continue; // PCを更新したのでループの先頭へ
                }
                break;

            case 'jnc': // キャリーがなければジャンプ（これもセットであると便利です）
                if (cf === 0) {
                    pc = labels[arg1];
                    continue;
                }
                break;

            case 'jmp':

                pc = labels[arg1];
                continue;

            case 'printn':
                currentOutput += getVal(arg1, memoryArray).toString();
                break;

            case 'printc':
                currentOutput += String.fromCharCode(getVal(arg1, memoryArray));
                break;

            case 'sub':
                var srcVal = getVal(arg2, memoryArray);
                var result = memoryArray[addr] - srcVal;

                // キャリーフラグ(借位)の判定：引く数の方が大きければCF=1
                cf = (memoryArray[addr] < srcVal) ? 1 : 0;

                memoryArray[addr] = (result + 256) % 256; // 8bit範囲に収める
                lastResult = memoryArray[addr];
                break;

            case 'not':
                // JavaScriptのビット反転「~」は32ビットで行われるため、
                // 最後に 0xFF (1111 1111) と AND を取って 8ビットに切り出します
                memoryArray[addr] = (~memoryArray[addr]) & 0xFF;
                lastResult = memoryArray[addr];
                break;

            case 'and':
                memoryArray[addr] &= getVal(arg2, memoryArray);
                lastResult = memoryArray[addr];
                break;

            case 'or':
                memoryArray[addr] |= getVal(arg2, memoryArray);
                lastResult = memoryArray[addr];
                break;

            case 'xor':
                memoryArray[addr] ^= getVal(arg2, memoryArray);
                lastResult = memoryArray[addr];
                break;

            case 'lsl': // 左論理シフト (2倍)
                var result = memoryArray[addr] << 1;
                cf = (result > 255) ? 1 : 0; // 溢れたビットをCFへ
                memoryArray[addr] = result % 256;
                lastResult = memoryArray[addr];
                break;

            case 'lsr': // 右論理シフト (1/2)
                cf = (memoryArray[addr] & 0x01); // 追い出される一番右のビットをCFへ
                memoryArray[addr] >>= 1;
                lastResult = memoryArray[addr];
                break;

            case 'sbc': // キャリー（ボロー）付き減算
                var srcVal = getVal(arg2, memoryArray);
                var result = memoryArray[addr] - srcVal - cf;
                cf = (memoryArray[addr] < (srcVal + cf)) ? 1 : 0;
                memoryArray[addr] = (result + 256) % 256;
                lastResult = memoryArray[addr];
                break;

            case 'neg': // 2の補数（符号反転）
                memoryArray[addr] = ((~memoryArray[addr] + 1) & 0xFF);
                lastResult = memoryArray[addr];
                break;

            case 'dec': // デクリメント (-1)
                memoryArray[addr] = (memoryArray[addr] - 1 + 256) % 256;
                lastResult = memoryArray[addr];
                break;

            case 'call': // 関数呼び出し
                // 戻り先アドレス（現在のPC+1）をスタックに保存
                memoryArray[sp] = pc + 1;
                sp--;
                pc = labels[arg1];
                continue;

            case 'ret': // 関数から復帰
                sp++;
                pc = memoryArray[sp];
                console.log("RET", pc, sp);
                continue;

            case 'push': // スタックへ値を保存
                var val = getVal(arg1, memoryArray);
                memoryArray[sp] = val;
                sp--;
                break;

            case 'pop': // スタックから値を取り出す
                sp++;
                memoryArray[addr] = memoryArray[sp];
                lastResult = memoryArray[addr];
                break;
            default:
                ct--;
                logs.push(`WARN: UNKNOWN OP`)
        }

        // フラグ更新
        if (lastResult !== null) zf = (lastResult === 0) ? 1 : 0;
        if (Number.isNaN(lastResult)) zf = 1;
        pc++;

    }
    if (pc >= codeData.length) {
        pc = 0;
        param.params.PC.value = pc;
        logs.push(`end of program.`);
    }
    notSave = false;

    param.params.PC.value = pc
    param.params.ZF.value = zf
    param.params.CF.value = cf
    param.params.RC.value = ct
    param.params.SP.value = sp
    textOutput.value = currentOutput;
    logs = logs.slice(-80);
    textLog.value = logs.join("\n");
    io.sync();
    memory.update();
    memory.stackFocus(sp);
    asm.focus(pc);
    asm.save();
    param.update();
}

function save() {
    const fnm = prompt("ファイル名", new Date().toLocaleString().replaceAll(/( |\/)/g, "_") + ".hf");
    if (!fnm) {
        return;
    }
    const saves = localStorage.getItem("asm") + "\n" + localStorage.getItem("memory") + "\n" + localStorage.getItem("param")
    const f = new Blob([saves], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = fnm;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function load() {
    const i = document.createElement("input")
    i.type = "file";
    i.accept = ".hf";
    i.onchange = () => {
        const file = i.files[0];
        if (file) {
            file.text().then(t => {
                const [vasm, vmemory, vparam] = t.split("\n");
                localStorage.setItem("asm", vasm)
                localStorage.setItem("memory", vmemory)
                localStorage.setItem("param", vparam)
                if (window.iscached) {
                    fetch("./index2.html").then(r => r.text()).then(t => {
                        const w = open();
                        w.$$cached = $$cached;
                        w.document.write(t);
                        w.document.close();
                        close();
                    });
                } else {
                    location.reload();
                }
            })
        }
    };
    i.click();
}