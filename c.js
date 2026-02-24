/**
 * C言語からアセンブリライクな言語へのコンパイラ
 * 対象アセンブリ: docs.mdで定義された256byteメモリのCPU
 */


class CCompiler {
    constructor() {
        this.variables = new Map(); // 変数名 -> メモリアドレス
        this.nextVarAddr = 0x10;    // 変数用メモリ開始アドレス
        this.labelCounter = 0;      // ラベル用カウンタ
        this.output = [];           // 出力アセンブリコード
        this.stringConstants = [];  // 文字列定数
        this.functions = new Map(); // 関数定義
        this.defines = new Map([
            ["DDRA","*(int *)0x1"],
            ["DDRB","*(int *)0x2"],
            ["PORTA","*(int *)0x3"],
            ["PORTB","*(int *)0x4"],
            ["PINA","*(int *)0x5"],
            ["PINB","*(int *)0x6"],
        ]);   // #define定義
    }

    // 1. 字句解析（トークナイザー）
    tokenize(code) {
        const tokens = [];
        let i = 0;
        let line = 0;

        // プリプロセッサディレクティブの処理
        const lines = code.split('\n');
        const processedLines = [];
        
        for (const currentLine of lines) {
            const trimmed = currentLine.trim();
            if (trimmed.startsWith('#define')) {
                // #define NAME VALUE 形式の解析
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 3) {
                    const name = parts[1];
                    const value = parts.slice(2).join(' ');
                    this.defines.set(name, value);
                }
                // #define行は除去
            } else {
                processedLines.push(currentLine);
            }
        }
        
        // #defineの置換を実行
        code = processedLines.join('\n');
        for (const [name, value] of this.defines) {
            // 単語境界を考慮した置換（正規表現を使用）
            const regex = new RegExp('\\b' + name + '\\b', 'g');
            code = code.replace(regex, value);
        }

        // コメントと空白を除去
        code = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

        while (i < code.length) {
            const char = code[i];

            if (char === "\n") {
                line++;
            }

            if (char === "\n" && code[i + 1] === "\n") {
                i++;
                tokens.push({ type: "BLANK", value: "\n", line });
                continue;
            }

            // 空白をスキップ
            if (/\s/.test(char)) {
                i++;
                continue;
            }

            // 数値
            if (/\d/.test(char)) {
                let num = '';
                
                // 16進数のチェック (0x...)
                if (char === '0' && i + 1 < code.length && (code[i + 1] === 'x' || code[i + 1] === 'X')) {
                    i += 2; // 0x をスキップ
                    while (i < code.length && /[0-9a-fA-F]/.test(code[i])) {
                        num += code[i++];
                    }
                    tokens.push({ type: 'NUMBER', value: parseInt(num, 16), line });
                } else if (char === '0' && i + 1 < code.length && (code[i + 1] === 'b' || code[i + 1] === 'B')) {
                    // 2進数のチェック (0b...)
                    i += 2; // 0b をスキップ
                    while (i < code.length && /[01]/.test(code[i])) {
                        num += code[i++];
                    }
                    tokens.push({ type: 'NUMBER', value: parseInt(num, 2), line });
                } else {
                    // 10進数
                    while (i < code.length && /\d/.test(code[i])) {
                        num += code[i++];
                    }
                    tokens.push({ type: 'NUMBER', value: parseInt(num), line });
                }
                continue;
            }

            // 識別子・キーワード
            if (/[a-zA-Z_]/.test(char)) {
                let ident = '';
                while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
                    ident += code[i++];
                }

                // キーワード判定
                const keywords = ['int', 'if', 'else', 'while', 'for', 'return', 'printf', 'asm'];
                const type = keywords.includes(ident) ? ident.toUpperCase() : 'IDENTIFIER';
                tokens.push({ type, value: ident, line });
                continue;
            }

            // 文字列リテラル
            if (char === '"') {
                let str = '';
                i++; // " をスキップ
                while (i < code.length && code[i] !== '"') {
                    if (code[i] === '\\' && i + 1 < code.length) {
                        // エスケープシーケンス
                        i++;
                        switch (code[i]) {
                            case 'n': str += '\n'; break;
                            case 't': str += '\t'; break;
                            case '\\': str += '\\'; break;
                            case '"': str += '"'; break;
                            default: str += code[i];
                        }
                    } else {
                        str += code[i];
                    }
                    i++;
                }
                i++; // 閉じる " をスキップ
                tokens.push({ type: 'STRING', value: str, line });
                continue;
            }

            // 演算子と区切り文字
            const operators = {
                '+': 'PLUS', '-': 'MINUS', '*': 'ASTERISK', '/': 'DIVIDE',
                '=': 'ASSIGN', '==': 'EQUAL', '!=': 'NOT_EQUAL',
                '<': 'LESS', '>': 'GREATER', '<=': 'LESS_EQUAL', '>=': 'GREATER_EQUAL',
                '<<': 'LSHIFT', '>>': 'RSHIFT',
                '&=': 'AND_ASSIGN', '|=': 'OR_ASSIGN', '^=': 'XOR_ASSIGN',
                '<<=': 'LSHIFT_ASSIGN', '>>=': 'RSHIFT_ASSIGN',
                '(': 'LPAREN', ')': 'RPAREN', '{': 'LBRACE', '}': 'RBRACE',
                '[': 'LBRACKET', ']': 'RBRACKET',
                ';': 'SEMICOLON', ',': 'COMMA',
                '&': 'BIT_AND', '|': 'BIT_OR', '^': 'BIT_XOR', '~': 'BIT_NOT',
            };

            // 3文字演算子チェック
            const threeChar = code.substr(i, 3);
            if (operators[threeChar]) {
                tokens.push({ type: operators[threeChar], value: threeChar, line });
                i += 3;
                continue;
            }

            // 2文字演算子チェック
            const twoChar = code.substr(i, 2);
            if (operators[twoChar]) {
                tokens.push({ type: operators[twoChar], value: twoChar, line });
                i += 2;
                continue;
            }

            // 1文字演算子
            if (operators[char]) {
                tokens.push({ type: operators[char], value: char, line });
                i++;
                continue;
            }

            // 不明な文字
            throw new Error(`Unknown character: ${char} at position ${i}`);
        }

        return tokens;
    }

    // 2. 構文解析と3. コード生成を組み合わせた再帰下降パーサー
    parse(tokens) {
        this.tokens = tokens;
        this.current = 0;
        this.output = [];

        // プログラム全体を解析
        this.parseProgram();

        this.output.splice(0, 0, `call main`, `jmp end`);
        this.output.push(`end:`);

        return this.output.join('\n');
    }

    // 現在のトークンを取得
    peek() {
        return this.tokens[this.current];
    }

    // 次のトークンに進む
    advance() {
        if (this.current < this.tokens.length) {
            this.current++;
        }
        return this.tokens[this.current - 1];
    }

    // 特定のタイプのトークンを期待
    expect(type) {
        const token = this.peek();
        if (!token || token.type !== type) {
            throw new Error(`Expected ${type}, got ${token ? token.type : 'EOF'}, at line ${token.line}`);
        }
        return this.advance();
    }

    // プログラム全体の解析
    parseProgram() {
        while (this.peek()) {
            if (this.peek().type === 'INT') {
                this.parseDeclarationOrFunction();
            } else {
                this.parseStatement();
            }
        }
    }

    // 宣言または関数定義
    parseDeclarationOrFunction() {
        this.expect('INT');
        
        // ポインタ型のチェック (int *var)
        if (this.peek()?.type === 'ASTERISK') {
            this.advance(); // *をスキップ
        }
        
        const name = this.expect('IDENTIFIER').value;

        if (this.peek()?.type === 'LPAREN') {
            // 関数定義
            this.parseFunctionDefinition(name);
        } else {
            // 変数宣言（ポインタ含む）
            this.parseVariableDeclaration(name);
        }
    }

    // 変数宣言
    parseVariableDeclaration(name) {
        // 配列宣言チェック (int arr[size])
        if (this.peek()?.type === 'LBRACKET') {
            this.advance(); // [
            const sizeToken = this.expect('NUMBER');
            const size = sizeToken.value;
            this.expect('RBRACKET');
            
            // 配列初期化のチェック
            if (this.peek()?.type === 'ASSIGN') {
                this.advance(); // =をスキップ
                
                if (this.peek()?.type === 'STRING') {
                    // 文字列による初期化: int nums[10] = "aaa";
                    const str = this.advance().value;
                    this.expect('SEMICOLON');
                    
                    // 配列用のメモリを確保
                    this.allocateArray(name, size);
                    const baseAddr = this.variables.get(name);
                    
                    // #string命令を使用して文字列を配列に格納
                    this.output.push(`#string "${str}" 0x${baseAddr.toString(16)}`);
                    
                } else if (this.peek()?.type === 'LBRACE') {
                    // 配列初期化: int nums[10] = {0,1,2};
                    this.advance(); // {をスキップ
                    
                    // 配列用のメモリを確保
                    this.allocateArray(name, size);
                    const baseAddr = this.variables.get(name);
                    
                    let index = 0;
                    while (this.peek() && this.peek().type !== 'RBRACE' && index < size) {
                        const value = this.parseExpression();
                        const elementAddr = baseAddr + index;
                        
                        if (typeof value === 'number') {
                            this.output.push(`mov 0x${elementAddr.toString(16)} #${value}`);
                        } else {
                            this.output.push(`mov 0x${elementAddr.toString(16)} ${value}`);
                        }
                        
                        index++;
                        
                        // カンマがあれば次の要素へ
                        if (this.peek()?.type === 'COMMA') {
                            this.advance();
                        } else {
                            break;
                        }
                    }
                    
                    this.expect('RBRACE');
                    this.expect('SEMICOLON');
                    
                } else {
                    // 通常の式による初期化
                    const value = this.parseExpression();
                    this.expect('SEMICOLON');
                    
                    this.allocateArray(name, size);
                    const baseAddr = this.variables.get(name);
                    
                    // 配列の最初の要素に値を設定
                    if (typeof value === 'number') {
                        this.output.push(`mov 0x${baseAddr.toString(16)} #${value}`);
                    } else {
                        this.output.push(`mov 0x${baseAddr.toString(16)} ${value}`);
                    }
                }
            } else {
                this.expect('SEMICOLON');
                // 配列用のメモリを確保
                this.allocateArray(name, size);
            }
        } else if (this.peek()?.type === 'ASSIGN') {
            this.advance(); // =
            const value = this.parseExpression();
            this.expect('SEMICOLON');

            // 変数をメモリに割り当て
            this.allocateVariable(name);

            // 初期値を設定
            if (typeof value === 'number') {
                this.output.push(`mov 0x${this.variables.get(name).toString(16)} #${value}`);
            } else {
                this.output.push(`mov 0x${this.variables.get(name).toString(16)} ${value}`);
            }
        } else {
            this.expect('SEMICOLON');
            this.allocateVariable(name);
        }
    }

    // 関数定義（簡単なmain関数のみ対応）
    parseFunctionDefinition(name) {
        this.expect('LPAREN');
        // 引数は省略（void main() 想定）
        this.expect('RPAREN');
        this.expect('LBRACE');

        if (name === 'main') {
            this.output.push('main:');
        } else {
            this.output.push(`${name}:`);
        }

        while (this.peek() && this.peek().type !== 'RBRACE') {
            this.parseStatement();
        }

        this.expect('RBRACE');
        
        // 関数の最後にretを追加（return文がない場合のため）
        if (this.output[this.output.length - 1] !== 'ret') {
            this.output.push('ret');
        }
    }

    // 文の解析
    parseStatement() {
        const token = this.peek();

        if (!token) return;

        switch (token.type) {
            case 'INT':
                this.parseDeclarationOrFunction();
                break;
            case 'IDENTIFIER': {
                // 先読みして関数呼び出し、配列アクセス、または代入かを判定
                const nextToken = this.tokens[this.current + 1];
                if (nextToken && nextToken.type === 'LPAREN') {
                    this.parseFunctionCall();
                } else {
                    this.parseAssignment();
                }
                break;
            }
            case 'ASTERISK':
                // ポインタによる代入 *p = value
                this.parseAssignment();
                break;
            case 'PRINTF':
                this.parsePrintf();
                break;
            case 'IF':
                this.parseIf();
                break;
            case 'WHILE':
                this.parseWhile();
                break;
            case 'RETURN':
                this.parseReturn();
                break;
            case 'ASM':
                this.parseInlineAssembly();
                break;
            case 'LBRACE':
                this.parseBlock();
                break;
            case 'BLANK':
                this.expect('BLANK');
                this.output.push("");
                break;
            default:
                this.parseExpression();
                this.expect('SEMICOLON');
        }
    }

    // 代入文
    parseAssignment() {
        let targetAddr = null;
        
        // ポインタへの代入かチェック（*variable = ... または *(type *)addr = ...）
        if (this.peek()?.type === 'ASTERISK') {
            this.advance(); // *をスキップ
            
            // 型キャスト形式かチェック
            if (this.peek()?.type === 'LPAREN') {
                // 型キャスト形式: *(int *)0x02 = value
                this.advance(); // (をスキップ
                
                // 型名をスキップ（INTまたはIDENTIFIER）
                const typeToken = this.peek();
                if (typeToken.type === 'INT' || typeToken.type === 'IDENTIFIER') {
                    this.advance();
                }
                
                // ポインタ型のチェック
                if (this.peek()?.type === 'ASTERISK') {
                    this.advance(); // *をスキップ
                }
                
                this.expect('RPAREN'); // )をスキップ
                
                // キャストされるアドレス（通常は数値リテラル）
                const addressValue = this.parseFactor();
                
                if (typeof addressValue === 'number') {
                    targetAddr = `*0x${addressValue.toString(16)}`;
                } else {
                    targetAddr = `*${addressValue}`;
                }
            } else {
                // 通常のポインタ代入: *pointer = value
                const ptrName = this.expect('IDENTIFIER').value;
                
                if (!this.variables.has(ptrName)) {
                    throw new Error(`Undefined variable: ${ptrName}`);
                }
                
                targetAddr = `*0x${this.variables.get(ptrName).toString(16)}`;
            }
        } else {
            const varName = this.expect('IDENTIFIER').value;
            
            // 配列アクセスのチェック
            if (this.peek()?.type === 'LBRACKET') {
                this.advance(); // [
                const index = this.parseExpression();
                this.expect('RBRACKET');
                
                if (!this.variables.has(varName)) {
                    throw new Error(`Undefined variable: ${varName}`);
                }
                
                // 配列要素への代入
                const baseAddr = this.variables.get(varName);
                if (typeof index === 'number') {
                    // インデックスが定数の場合
                    const elementAddr = baseAddr + index;
                    targetAddr = `0x${elementAddr.toString(16)}`;
                } else {
                    // インデックスが変数の場合
                    const tempAddr = this.nextVarAddr++;
                    this.output.push(`mov 0x${tempAddr.toString(16)} #${baseAddr}`);
                    this.output.push(`add 0x${tempAddr.toString(16)} ${index}`);
                    targetAddr = `*0x${tempAddr.toString(16)}`;
                }
            } else {
                // 通常の変数への代入
                if (!this.variables.has(varName)) {
                    this.allocateVariable(varName);
                }
                targetAddr = `0x${this.variables.get(varName).toString(16)}`;
            }
        }
        
        // 代入演算子のチェック
        const assignToken = this.peek();
        let isCompoundAssignment = false;
        let compoundOp = null;
        
        if (assignToken.type === 'ASSIGN') {
            this.advance();
        } else if (['AND_ASSIGN', 'OR_ASSIGN', 'XOR_ASSIGN', 'LSHIFT_ASSIGN', 'RSHIFT_ASSIGN'].includes(assignToken.type)) {
            isCompoundAssignment = true;
            compoundOp = assignToken.type;
            this.advance();
        } else {
            throw new Error(`Expected assignment operator, got ${assignToken.type}`);
        }
        
        const value = this.parseExpression();
        this.expect('SEMICOLON');

        if (isCompoundAssignment) {
            // 複合代入の場合：target op= value → target = target op value
            const tempAddr = this.nextVarAddr++;
            
            // 現在の値を一時変数に読み込み
            this.output.push(`mov 0x${tempAddr.toString(16)} ${targetAddr.startsWith('*') ? targetAddr : targetAddr}`);
            
            // 演算を実行
            switch (compoundOp) {
                case 'AND_ASSIGN':
                    this.output.push(`and 0x${tempAddr.toString(16)} ${typeof value === 'number' ? '#' + value : value}`);
                    break;
                case 'OR_ASSIGN':
                    this.output.push(`or 0x${tempAddr.toString(16)} ${typeof value === 'number' ? '#' + value : value}`);
                    break;
                case 'XOR_ASSIGN':
                    this.output.push(`xor 0x${tempAddr.toString(16)} ${typeof value === 'number' ? '#' + value : value}`);
                    break;
                case 'LSHIFT_ASSIGN':
                    this.output.push(`shl 0x${tempAddr.toString(16)} ${typeof value === 'number' ? '#' + value : value}`);
                    break;
                case 'RSHIFT_ASSIGN':
                    this.output.push(`shr 0x${tempAddr.toString(16)} ${typeof value === 'number' ? '#' + value : value}`);
                    break;
            }
            
            // 結果を元の変数に格納
            this.output.push(`mov ${targetAddr} 0x${tempAddr.toString(16)}`);
        } else {
            // 通常の代入
            if (typeof value === 'number') {
                this.output.push(`mov ${targetAddr} #${value}`);
            } else {
                this.output.push(`mov ${targetAddr} ${value}`);
            }
        }
    }

    // 関数呼び出し
    parseFunctionCall() {
        const funcName = this.expect('IDENTIFIER').value;
        this.expect('LPAREN');
        
        // 引数の解析（現在は引数なしの関数のみサポート）
        // TODO: 将来的に引数をサポートする場合はここで処理
        
        this.expect('RPAREN');
        this.expect('SEMICOLON');
        
        // 関数呼び出しのアセンブリコードを生成
        this.output.push(`call ${funcName}`);
    }

    // インラインアセンブリ
    parseInlineAssembly() {
        this.expect('ASM');
        this.expect('LPAREN');
        
        // アセンブリコードは文字列リテラルで記述
        const asmCode = this.expect('STRING').value;
        
        this.expect('RPAREN');
        this.expect('SEMICOLON');
        
        // アセンブリコードをそのまま出力に追加（行ごとに分割）
        const lines = asmCode.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        for (const line of lines) {
            this.output.push(line);
        }
    }

    // printf文
    parsePrintf() {
        this.expect('PRINTF');
        this.expect('LPAREN');

        if (this.peek().type === 'STRING') {
            const str = this.advance().value;

            // カンマがある場合は引数をチェック
            if (this.peek()?.type === 'COMMA') {
                this.advance(); // カンマをスキップ
                const value = this.parseExpression();
                this.expect('RPAREN');
                this.expect('SEMICOLON');

                // %d などのフォーマット指定子を処理
                if (str.includes('%d')) {
                    // 数値として出力
                    if (typeof value === 'number') {
                        this.output.push(`printn #${value}`);
                    } else {
                        this.output.push(`printn ${value}`);
                    }
                } else {
                    // 文字列として出力
                    for (const char of str) {
                        this.output.push(`printc #${char.charCodeAt(0)}`);
                    }
                }
            } else {
                this.expect('RPAREN');
                this.expect('SEMICOLON');

                // 文字列を文字コードで出力
                for (const char of str) {
                    this.output.push(`printc #${char.charCodeAt(0)}`);
                }
            }
        } else {
            // 変数や式の値を出力
            const value = this.parseExpression();
            this.expect('RPAREN');
            this.expect('SEMICOLON');

            if (typeof value === 'number') {
                this.output.push(`printn #${value}`);
            } else {
                this.output.push(`printn ${value}`);
            }
        }
    }

    // 式の解析（演算子の優先順位を考慮）
    parseExpression() {
        return this.parseBitOr();
    }

    // ビットOR演算 ( | )
    parseBitOr() {
        let left = this.parseBitXor();

        while (this.peek() && this.peek().type === 'BIT_OR') {
            this.advance(); // |
            const right = this.parseBitXor();

            const tempAddr = this.nextVarAddr++;
            this.output.push(`mov 0x${tempAddr.toString(16)} ${typeof left === 'number' ? '#' + left : left}`);
            this.output.push(`or 0x${tempAddr.toString(16)} ${typeof right === 'number' ? '#' + right : right}`);

            left = `0x${tempAddr.toString(16)}`;
        }

        return left;
    }

    // ビットXOR演算 ( ^ )
    parseBitXor() {
        let left = this.parseBitAnd();

        while (this.peek() && this.peek().type === 'BIT_XOR') {
            this.advance(); // ^
            const right = this.parseBitAnd();

            const tempAddr = this.nextVarAddr++;
            this.output.push(`mov 0x${tempAddr.toString(16)} ${typeof left === 'number' ? '#' + left : left}`);
            this.output.push(`xor 0x${tempAddr.toString(16)} ${typeof right === 'number' ? '#' + right : right}`);

            left = `0x${tempAddr.toString(16)}`;
        }

        return left;
    }

    // ビットAND演算 ( & )
    parseBitAnd() {
        let left = this.parseShift();

        while (this.peek() && this.peek().type === 'BIT_AND') {
            this.advance(); // &
            const right = this.parseShift();

            const tempAddr = this.nextVarAddr++;
            this.output.push(`mov 0x${tempAddr.toString(16)} ${typeof left === 'number' ? '#' + left : left}`);
            this.output.push(`and 0x${tempAddr.toString(16)} ${typeof right === 'number' ? '#' + right : right}`);

            left = `0x${tempAddr.toString(16)}`;
        }

        return left;
    }

    // シフト演算 ( << >> )
    parseShift() {
        let left = this.parseAddSub();

        while (this.peek() && (this.peek().type === 'LSHIFT' || this.peek().type === 'RSHIFT')) {
            const op = this.advance().type;
            const right = this.parseAddSub();

            const tempAddr = this.nextVarAddr++;
            this.output.push(`mov 0x${tempAddr.toString(16)} ${typeof left === 'number' ? '#' + left : left}`);

            if (op === 'LSHIFT') {
                this.output.push(`shl 0x${tempAddr.toString(16)} ${typeof right === 'number' ? '#' + right : right}`);
            } else {
                this.output.push(`shr 0x${tempAddr.toString(16)} ${typeof right === 'number' ? '#' + right : right}`);
            }

            left = `0x${tempAddr.toString(16)}`;
        }

        return left;
    }

    // 加算減算演算 ( + - )
    parseAddSub() {
        let left = this.parseTerm();

        while (this.peek() && (this.peek().type === 'PLUS' || this.peek().type === 'MINUS')) {
            const op = this.advance().type;
            const right = this.parseTerm();

            // 一時的な結果を計算
            const tempAddr = this.nextVarAddr++;
            this.output.push(`mov 0x${tempAddr.toString(16)} ${typeof left === 'number' ? '#' + left : left}`);

            if (op === 'PLUS') {
                this.output.push(`add 0x${tempAddr.toString(16)} ${typeof right === 'number' ? '#' + right : right}`);
            } else {
                this.output.push(`sub 0x${tempAddr.toString(16)} ${typeof right === 'number' ? '#' + right : right}`);
            }

            left = `0x${tempAddr.toString(16)}`;
        }

        return left;
    }

    // 項の解析
    parseTerm() {
        let left = this.parseFactor();

        while (this.peek() && this.peek().type === 'ASTERISK') {
            this.advance(); // *
            const right = this.parseFactor();

            // 乗算の実装
            const tempAddr = this.nextVarAddr++;
            this.output.push(`mov 0x${tempAddr.toString(16)} ${typeof left === 'number' ? '#' + left : left}`);
            this.output.push(`mul 0x${tempAddr.toString(16)} ${typeof right === 'number' ? '#' + right : right}`);

            left = `0x${tempAddr.toString(16)}`;
        }

        return left;
    }

    // 因子の解析
    parseFactor() {
        const token = this.peek();

        if (token.type === 'NUMBER') {
            return this.advance().value;
        } else if (token.type === 'BIT_NOT') {
            // ビット否定演算子 ~value
            this.advance(); // ~をスキップ
            const operand = this.parseFactor();
            
            const tempAddr = this.nextVarAddr++;
            this.output.push(`mov 0x${tempAddr.toString(16)} ${typeof operand === 'number' ? '#' + operand : operand}`);
            this.output.push(`not 0x${tempAddr.toString(16)}`);
            
            return `0x${tempAddr.toString(16)}`;
        } else if (token.type === 'BIT_AND') {
            // アドレス取得演算子 &variable
            this.advance(); // &をスキップ
            const varToken = this.expect('IDENTIFIER');
            const varName = varToken.value;
            
            if (!this.variables.has(varName)) {
                throw new Error(`Undefined variable: ${varName}`);
            }
            
            // 変数のアドレスを返す（即値として）
            const addr = this.variables.get(varName);
            return addr;
        } else if (token.type === 'ASTERISK') {
            // 間接参照演算子 *pointer または *(type *)address
            this.advance(); // *をスキップ
            
            // 型キャストのチェック (int *)
            if (this.peek()?.type === 'LPAREN') {
                // 型キャスト形式: *(int *)0x02
                this.advance(); // (をスキップ
                
                // 型名をスキップ（INTまたはIDENTIFIER）
                const typeToken = this.peek();
                if (typeToken.type === 'INT' || typeToken.type === 'IDENTIFIER') {
                    this.advance();
                }
                
                // ポインタ型のチェック
                if (this.peek()?.type === 'ASTERISK') {
                    this.advance(); // *をスキップ
                }
                
                this.expect('RPAREN'); // )をスキップ
                
                // キャストされるアドレス（通常は数値リテラル）
                const addressValue = this.parseFactor();
                
                // 指定されたアドレスの値を取得
                const tempAddr = this.nextVarAddr++;
                if (typeof addressValue === 'number') {
                    this.output.push(`mov 0x${tempAddr.toString(16)} *0x${addressValue.toString(16)}`);
                } else {
                    this.output.push(`mov 0x${tempAddr.toString(16)} *${addressValue}`);
                }
                
                return `0x${tempAddr.toString(16)}`;
            } else {
                // 通常のポインタ間接参照 *pointer
                const ptrValue = this.parseFactor();
                
                // ポインタが指すアドレスの値を取得
                const tempAddr = this.nextVarAddr++;
                if (typeof ptrValue === 'number') {
                    // ポインタ値が定数の場合
                    this.output.push(`mov 0x${tempAddr.toString(16)} *0x${ptrValue.toString(16)}`);
                } else {
                    // ポインタ値が変数の場合
                    this.output.push(`mov 0x${tempAddr.toString(16)} *${ptrValue}`);
                }
                
                return `0x${tempAddr.toString(16)}`;
            }
        } else if (token.type === 'IDENTIFIER') {
            const varName = this.advance().value;
            
            // 配列アクセスのチェック
            if (this.peek()?.type === 'LBRACKET') {
                this.advance(); // [
                const index = this.parseExpression();
                this.expect('RBRACKET');
                
                if (!this.variables.has(varName)) {
                    throw new Error(`Undefined variable: ${varName}`);
                }
                
                // 配列の要素アドレスを計算: base_addr + index
                const baseAddr = this.variables.get(varName);
                const tempAddr = this.nextVarAddr++;
                
                if (typeof index === 'number') {
                    // インデックスが定数の場合
                    const elementAddr = baseAddr + index;
                    return `0x${elementAddr.toString(16)}`;
                } else {
                    // インデックスが変数の場合
                    this.output.push(`mov 0x${tempAddr.toString(16)} #${baseAddr}`);
                    this.output.push(`add 0x${tempAddr.toString(16)} ${index}`);
                    
                    // 計算されたアドレスを間接参照
                    const resultAddr = this.nextVarAddr++;
                    this.output.push(`mov 0x${resultAddr.toString(16)} *0x${tempAddr.toString(16)}`);
                    return `0x${resultAddr.toString(16)}`;
                }
            } else {
                // 通常の変数参照
                if (!this.variables.has(varName)) {
                    throw new Error(`Undefined variable: ${varName}`);
                }
                return `0x${this.variables.get(varName).toString(16)}`;
            }
        } else if (token.type === 'LPAREN') {
            this.advance(); // (
            const expr = this.parseExpression();
            this.expect('RPAREN');
            return expr;
        } else {
            throw new Error(`Unexpected token: ${token.type}, at line ${token.line}`);
        }
    }

    // if文の解析
    parseIf() {
        this.expect('IF');
        this.expect('LPAREN');
        const conditionType = this.parseCondition();
        this.expect('RPAREN');

        const elseLabel = `else_${this.labelCounter++}`;
        const endLabel = `endif_${this.labelCounter++}`;

        // 条件に応じた分岐命令を生成
        switch (conditionType) {
            case 'EQUAL':
                this.output.push(`jnz ${elseLabel}`); // 等しくない場合はelse部に
                break;
            case 'NOT_EQUAL':
                this.output.push(`jz ${elseLabel}`);  // 等しい場合はelse部に
                break;
            case 'LESS':
                this.output.push(`jnc ${elseLabel}`); // キャリーが立たない（A>=B）場合はelse部に
                break;
            case 'GREATER':
                this.output.push(`jc ${elseLabel}`);  // キャリーが立つ（A<B）場合はelse部に
                this.output.push(`jz ${elseLabel}`);  // 等しい場合もelse部に
                break;
            case 'LESS_EQUAL': {
                // A <= B の場合にthen部実行
                const thenLabel = `then_${this.labelCounter++}`;
                this.output.push(`jc ${thenLabel}`);  // CF=1なら条件成立
                this.output.push(`jz ${thenLabel}`);  // ZF=1なら条件成立
                this.output.push(`jmp ${elseLabel}`); // どちらでもないならelse部
                this.output.push(`${thenLabel}:`);
                break;
            }
            case 'GREATER_EQUAL':
                this.output.push(`jc ${elseLabel}`);  // A<Bならelse部に
                break;
            default:
                this.output.push(`jz ${elseLabel}`);
        }

        this.parseStatement();
        this.output.push(`jmp ${endLabel}`);
        this.output.push(`${elseLabel}:`);

        if (this.peek()?.type === 'ELSE') {
            this.advance();
            this.parseStatement();
        }

        this.output.push(`${endLabel}:`);
    }

    // 条件式の解析（簡単な比較のみ）
    parseCondition() {
        const left = this.parseExpression();
        const opToken = this.advance(); // 比較演算子
        const right = this.parseExpression();

        // 比較を実装（cmp命令使用）
        const tempAddr = this.nextVarAddr++;
        this.output.push(`mov 0x${tempAddr.toString(16)} ${typeof left === 'number' ? '#' + left : left}`);
        this.output.push(`cmp 0x${tempAddr.toString(16)} ${typeof right === 'number' ? '#' + right : right}`);

        // 条件の種類を返す（後で分岐命令を決めるため）
        return opToken.type;
    }

    // while文の解析
    parseWhile() {
        this.expect('WHILE');
        const loopLabel = `loop_${this.labelCounter++}`;
        const endLabel = `endloop_${this.labelCounter++}`;

        this.output.push(`${loopLabel}:`);
        this.expect('LPAREN');
        const conditionType = this.parseCondition();
        this.expect('RPAREN');

        // 条件に応じた分岐命令を生成（条件が偽の場合にループ終了）
        switch (conditionType) {
            case 'EQUAL':
                this.output.push(`jnz ${endLabel}`); // ZF=0なら終了
                break;
            case 'NOT_EQUAL':
                this.output.push(`jz ${endLabel}`);  // ZF=1なら終了
                break;
            case 'LESS':
                this.output.push(`jnc ${endLabel}`); // CF=0なら終了（A>=B）
                break;
            case 'GREATER':
                // A > B ⇔ !(A <= B) ⇔ !((A < B) || (A == B))
                this.output.push(`jc ${endLabel}`);  // CF=1なら終了（A<B）
                this.output.push(`jz ${endLabel}`);  // ZF=1なら終了（A==B）
                break;
            case 'LESS_EQUAL': {
                // A <= B ⇔ (A < B) || (A == B) ⇔ CF=1 || ZF=1
                // 条件が偽（A > B）の場合：CF=0 かつ ZF=0
                const tempLabel = `temp_${this.labelCounter++}`;
                this.output.push(`jc ${tempLabel}`);  // CF=1なら条件成立、ループ継続
                this.output.push(`jz ${tempLabel}`);  // ZF=1なら条件成立、ループ継続
                this.output.push(`jmp ${endLabel}`);  // どちらでもないならループ終了（A>B）
                this.output.push(`${tempLabel}:`);
                break;
            }
            case 'GREATER_EQUAL':
                // A >= B ⇔ !(A < B) ⇔ CF=0
                this.output.push(`jc ${endLabel}`);   // CF=1なら終了（A<B）
                break;
            default:
                this.output.push(`jz ${endLabel}`);
        }

        this.parseStatement();
        this.output.push(`jmp ${loopLabel}`);
        this.output.push(`${endLabel}:`);
    }

    // return文の解析
    parseReturn() {
        this.expect('RETURN');
        if (this.peek()?.type !== 'SEMICOLON') {
            this.parseExpression(); // 戻り値は無視（簡単のため）
        }
        this.expect('SEMICOLON');
        this.output.push('ret');
    }

    // ブロック文の解析
    parseBlock() {
        this.expect('LBRACE');
        while (this.peek() && this.peek().type !== 'RBRACE') {
            this.parseStatement();
        }
        this.expect('RBRACE');
    }

    // 変数をメモリに割り当て
    allocateVariable(name) {
        if (!this.variables.has(name)) {
            this.variables.set(name, this.nextVarAddr++);
        }
    }

    // 配列をメモリに割り当て
    allocateArray(name, size) {
        if (!this.variables.has(name)) {
            this.variables.set(name, this.nextVarAddr);
            this.nextVarAddr += size; // サイズ分のメモリを確保
        }
    }

    // コンパイル実行
    compile(cCode) {
        try {
            const tokens = this.tokenize(cCode);
            console.log('Tokens:', tokens);

            const assembly = this.parse(tokens);
            return assembly;
        } catch (error) {
            console.error('Compilation Error:', error.message);
            throw error;
        }
    }
}

function testCompiler() {
    console.log("=== Test 1: ポインタと関数呼び出し ===");
    const compiler1 = new CCompiler();
    try {
        const result1 = compiler1.compile(
`
int min_arg1;
int min_arg2;
int min_return;

int main() {
    int x = 10;
    int y = 20;
    min_arg1 = &x;
    min_arg2 = &y;
    min();
    printf("%d", *min_return);
    return 0;
}

int min(){
if(*min_arg1 < *min_arg2){
min_return = min_arg1;
}else{
min_return = min_arg2;
}
}`
        );
        console.log("--- Assembly Output ---");
        console.log(result1);
    } catch (e) {
        console.log("--- Compile failed ---");
        console.error(e.message);
    }

    console.log("\n=== Test 2: 配列 ===");
    const compiler2 = new CCompiler();
    try {
        const result2 = compiler2.compile(
`
int main() {
    int arr[5];
    arr[0] = 10;
    arr[1] = 20;
    arr[2] = arr[0] + arr[1];
    printf("%d", arr[2]);
    return 0;
}`
        );
        console.log("--- Assembly Output ---");
        console.log(result2);
    } catch (e) {
        console.log("--- Compile failed ---");
        console.error(e.message);
    }

    console.log("\n=== Test 3: ポインタ演算 ===");
    const compiler3 = new CCompiler();
    try {
        const result3 = compiler3.compile(
`
int main() {
    int x = 42;
    int *p = &x;
    *p = 100;
    printf("%d", x);
    return 0;
}`
        );
        console.log("--- Assembly Output ---");
        console.log(result3);
    } catch (e) {
        console.log("--- Compile failed ---");
        console.error(e.message);
    }

    console.log("\n=== Test 4: 型キャストポインタ ===");
    const compiler4 = new CCompiler();
    try {
        const result4 = compiler4.compile(
`
int main() {
    *(int *)0x02 = 123;
    printf("%d", *(int *)0x02);
    return 0;
}`
        );
        console.log("--- Assembly Output ---");
        console.log(result4);
    } catch (e) {
        console.log("--- Compile failed ---");
        console.error(e.message);
    }

    console.log("\n=== Test 5: 16進数リテラル ===");
    const compiler5 = new CCompiler();
    try {
        const result5 = compiler5.compile(
`
int main() {
    int x = 0xFF;
    int y = 0x10;
    printf("%d", x + y);
    return 0;
}`
        );
        console.log("--- Assembly Output ---");
        console.log(result5);
    } catch (e) {
        console.log("--- Compile failed ---");
        console.error(e.message);
    }

    console.log("\n=== Test 6: #define サポート ===");
    const compiler6 = new CCompiler();
    try {
        const result6 = compiler6.compile(
`#define MAX_SIZE 100
#define PI 3

int main() {
    int size = MAX_SIZE;
    int area = PI * 5;
    printf("%d", size + area);
    return 0;
}`
        );
        console.log("--- Assembly Output ---");
        console.log(result6);
    } catch (e) {
        console.log("--- Compile failed ---");
        console.error(e.message);
    }

    console.log("\n=== Test 7: ビット演算 ===");
    const compiler7 = new CCompiler();
    try {
        const result7 = compiler7.compile(
`
int main() {
    int a = 15;  // 0x0F
    int b = 3;   // 0x03
    
    int and_result = a & b;     // 0x03
    int or_result = a | b;      // 0x0F
    int xor_result = a ^ b;     // 0x0C
    int not_result = ~a;        // 0xF0
    int lshift = a << 2;        // 0x3C
    int rshift = a >> 2;        // 0x03
    
    printf("%d", and_result);
    printf("%d", or_result);
    printf("%d", xor_result);
    printf("%d", lshift);
    printf("%d", rshift);
    return 0;
}`
        );
        console.log("--- Assembly Output ---");
        console.log(result7);
    } catch (e) {
        console.log("--- Compile failed ---");
        console.error(e.message);
    }

    console.log("\n=== Test 8: ビット代入演算 ===");
    const compiler8 = new CCompiler();
    try {
        const result8 = compiler8.compile(
`
int main() {
    int x = 15;
    x &= 7;      // x = x & 7
    printf("%d", x);
    
    x |= 8;      // x = x | 8  
    printf("%d", x);
    
    x ^= 3;      // x = x ^ 3
    printf("%d", x);
    
    x <<= 1;     // x = x << 1
    printf("%d", x);
    
    x >>= 2;     // x = x >> 2
    printf("%d", x);
    
    return 0;
}`
        );
        console.log("--- Assembly Output ---");
        console.log(result8);
    } catch (e) {
        console.log("--- Compile failed ---");
        console.error(e.message);
    }

    console.log("\n=== Test 9: 配列初期化（数値リスト） ===");
    const compiler9 = new CCompiler();
    try {
        const result9 = compiler9.compile(
`
int main() {
    int nums[5] = {10, 20, 30, 40, 50};
    printf("%d", nums[0]);
    printf("%d", nums[2]);
    printf("%d", nums[4]);
    return 0;
}`
        );
        console.log("--- Assembly Output ---");
        console.log(result9);
    } catch (e) {
        console.log("--- Compile failed ---");
        console.error(e.message);
    }

    console.log("\n=== Test 10: 配列初期化（文字列） ===");
    const compiler10 = new CCompiler();
    try {
        const result10 = compiler10.compile(
`
int main() {
    int message[10] = "Hello";
    printf("%d", message[0]);  // 'H' = 72
    printf("%d", message[1]);  // 'e' = 101
    return 0;
}`
        );
        console.log("--- Assembly Output ---");
        console.log(result10);
    } catch (e) {
        console.log("--- Compile failed ---");
        console.error(e.message);
    }

    console.log("\n=== Test 11: インラインアセンブリ ===");
    const compiler11 = new CCompiler();
    try {
        const result11 = compiler11.compile(
`
int main() {
    int x = 100;
    printf("%d", x);
    
    asm("mov 0x10 #200\\nprintn 0x10");
    
    printf("%d", x);
    return 0;
}`
        );
        console.log("--- Assembly Output ---");
        console.log(result11);
    } catch (e) {
        console.log("--- Compile failed ---");
        console.error(e.message);
    }

    console.log("\n=== Test 12: 2進数リテラル ===");
    const compiler12 = new CCompiler();
    try {
        const result12 = compiler12.compile(
`
int main() {
    int binary1 = 0b1010;    // 10 in decimal
    int binary2 = 0B1100;    // 12 in decimal
    int binary3 = 0b11111111; // 255 in decimal
    
    printf("%d", binary1);    // Should print 10
    printf("%d", binary2);    // Should print 12
    printf("%d", binary3);    // Should print 255
    
    int result = binary1 + binary2; // 10 + 12 = 22
    printf("%d", result);
    
    return 0;
}`
        );
        console.log("--- Assembly Output ---");
        console.log(result12);
    } catch (e) {
        console.log("--- Compile failed ---");
        console.error(e.message);
    }
}
testCompiler();
