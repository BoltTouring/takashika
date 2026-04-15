const KATAKANA_RANGE = /[\u30A1-\u30FA]/g;
const JAPANESE_TEXT_RANGE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;

function normalizeMeaning(text) {
    return text
        .trim()
        .toLowerCase()
        .replace(/-/g, ' ')
        .replace(/[.'\/]/g, '')
        .replace(/\s+/g, ' ');
}

function normalizeReadingInput(text) {
    return text
        .trim()
        .toLowerCase()
        .replace(/[.'\/\-\s]/g, '')
        .replace(/ｎ/g, 'n');
}

export class AnswerChecker {
    static toHiragana(input) {
        if (!input) return '';
        const normalized = normalizeReadingInput(input).replace(KATAKANA_RANGE, char =>
            String.fromCharCode(char.charCodeAt(0) - 0x60)
        );
        return this.convertRomajiToHiragana(normalized);
    }

    static getAcceptedMeanings(subject, studyMaterial) {
        const subjectMeanings = (subject.data.meanings || [])
            .filter(item => item.accepted_answer !== false)
            .map(item => item.meaning);
        const auxiliaryMeanings = (subject.data.auxiliary_meanings || [])
            .filter(item => item.type === 'whitelist')
            .map(item => item.meaning);
        const studyMeanings = studyMaterial?.data?.meaning_synonyms || [];
        return [...subjectMeanings, ...auxiliaryMeanings, ...studyMeanings];
    }

    static getRejectedMeanings(subject) {
        return (subject.data.auxiliary_meanings || [])
            .filter(item => item.type === 'blacklist')
            .map(item => item.meaning);
    }

    static getAcceptedReadings(subject) {
        return (subject.data.readings || [])
            .filter(item => item.accepted_answer !== false)
            .map(item => item.reading);
    }

    static checkMeaning(userAnswer, subject, studyMaterial) {
        const normalizedAnswer = normalizeMeaning(userAnswer);
        if (!normalizedAnswer || JAPANESE_TEXT_RANGE.test(normalizedAnswer)) return false;

        const rejected = this.getRejectedMeanings(subject)
            .some(meaning => normalizeMeaning(meaning) === normalizedAnswer);
        if (rejected) return false;

        return this.getAcceptedMeanings(subject, studyMaterial)
            .some(meaning => normalizeMeaning(meaning) === normalizedAnswer);
    }

    static checkReading(userAnswer, subject) {
        const normalizedAnswer = this.toHiragana(userAnswer);
        if (!normalizedAnswer) return false;
        return this.getAcceptedReadings(subject)
            .some(reading => this.toHiragana(reading) === normalizedAnswer);
    }

    static convertRomajiToHiragana(input) {
        if (!input) return '';
        let text = input.toLowerCase();

        text = text.replace(/(bb|cc|dd|ff|gg|hh|jj|kk|ll|mm|pp|qq|rr|ss|tt|vv|ww|xx|zz)/g, match => `っ${match[0]}`);
        text = text.replace(/jya/g, 'ja').replace(/jyu/g, 'ju').replace(/jyo/g, 'jo');
        text = text.replace(/zya/g, 'ja').replace(/zyu/g, 'ju').replace(/zyo/g, 'jo');

        const digraphs = {
            kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
            sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
            cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ',
            nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
            hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
            mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
            rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
            gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
            ja: 'じゃ', ju: 'じゅ', jo: 'じょ',
            bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
            pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ'
        };

        for (const [romaji, kana] of Object.entries(digraphs)) {
            text = text.replace(new RegExp(romaji, 'g'), kana);
        }

        text = text.replace(/shi/g, 'し').replace(/chi/g, 'ち').replace(/tsu/g, 'つ');
        text = text.replace(/ji/g, 'じ');
        text = text.replace(/di/g, 'ぢ').replace(/du/g, 'づ');

        const syllables = {
            a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
            ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
            sa: 'さ', su: 'す', se: 'せ', so: 'そ',
            ta: 'た', te: 'て', to: 'と',
            na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
            ha: 'は', hi: 'ひ', fu: 'ふ', he: 'へ', ho: 'ほ',
            ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
            ya: 'や', yu: 'ゆ', yo: 'よ',
            ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
            wa: 'わ', wo: 'を',
            ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
            za: 'ざ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
            da: 'だ', de: 'で', do: 'ど',
            ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
            pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ'
        };

        for (const romaji of Object.keys(syllables).sort((left, right) => right.length - left.length)) {
            text = text.replace(new RegExp(romaji, 'g'), syllables[romaji]);
        }

        return text.replace(/n(?![aiueoy])/g, 'ん');
    }
}
