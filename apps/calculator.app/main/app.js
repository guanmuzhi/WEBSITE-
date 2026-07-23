class Calculator {
    constructor() {
        this.expressionEl = document.getElementById('expression');
        this.resultEl = document.getElementById('result');
        this.current = '';
        this.lastResult = '';
        this.justEvaluated = false;

        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleInput(btn.dataset.value));
        });

        document.addEventListener('keydown', e => {
            const key = e.key;
            if (/[0-9.]/.test(key)) this.handleInput(key);
            else if (['+', '-', '*', '/', '(', ')', '%', '^'].includes(key)) this.handleInput(key);
            else if (key === 'Enter' || key === '=') { e.preventDefault(); this.handleInput('='); }
            else if (key === 'Backspace') this.handleInput('DEL');
            else if (key === 'Escape') this.handleInput('AC');
        });
    }

    handleInput(val) {
        if (val === 'AC') {
            this.current = '';
            this.lastResult = '';
            this.justEvaluated = false;
            this.update();
            return;
        }

        if (val === 'DEL') {
            this.current = this.current.slice(0, -1);
            this.update();
            return;
        }

        if (val === '=') {
            this.evaluate();
            return;
        }

        if (this.justEvaluated && /[0-9.]/.test(val)) {
            this.current = '';
        }
        this.justEvaluated = false;

        if (['sin', 'cos', 'tan', 'log', 'ln', 'sqrt', 'pi', 'e', '1/x'].includes(val)) {
            this.current += this.getFuncValue(val);
        } else {
            this.current += val;
        }

        this.update();
    }

    getFuncValue(val) {
        switch (val) {
            case 'sin': return 'sin(';
            case 'cos': return 'cos(';
            case 'tan': return 'tan(';
            case 'log': return 'log10(';
            case 'ln': return 'log(';
            case 'sqrt': return 'sqrt(';
            case 'pi': return 'pi';
            case 'e': return 'e';
            case '1/x': return '1/(';
            default: return val;
        }
    }

    evaluate() {
        if (!this.current) return;

        let expr = this.current;
        expr = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');

        try {
            let safe = expr;
            safe = safe.replace(/pi/g, `(${Math.PI})`);
            safe = safe.replace(/e/g, `(${Math.E})`);
            safe = safe.replace(/sin\(/g, 'Math.sin(');
            safe = safe.replace(/cos\(/g, 'Math.cos(');
            safe = safe.replace(/tan\(/g, 'Math.tan(');
            safe = safe.replace(/log10\(/g, 'Math.log10(');
            safe = safe.replace(/log\(/g, 'Math.log(');
            safe = safe.replace(/sqrt\(/g, 'Math.sqrt(');
            safe = safe.replace(/\^/g, '**');

            const result = Function('"use strict"; return (' + safe + ')')();

            if (!isFinite(result) || isNaN(result)) {
                this.resultEl.textContent = '错误';
                this.lastResult = '';
            } else {
                const formatted = this.format(result);
                this.lastResult = formatted;
                this.resultEl.textContent = formatted;
            }

            this.expressionEl.textContent = this.current + ' =';
            this.current = this.lastResult;
            this.justEvaluated = true;
        } catch (e) {
            this.resultEl.textContent = '错误';
            this.expressionEl.textContent = this.current;
            this.justEvaluated = true;
        }
    }

    format(n) {
        if (Math.abs(n) > 1e10 || (Math.abs(n) < 1e-10 && n !== 0)) {
            return n.toExponential(6);
        }
        const s = parseFloat(n.toPrecision(12)).toString();
        if (s.length > 12) return parseFloat(n.toPrecision(10)).toString();
        return s;
    }

    update() {
        this.expressionEl.textContent = '';
        this.resultEl.textContent = this.current || '0';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Calculator();
});
