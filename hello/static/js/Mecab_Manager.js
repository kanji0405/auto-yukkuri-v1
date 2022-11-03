/*
1. (PY)URL先取得
2. (JS)DOMから文章抽出、括弧を消す or 自由作文
s3. (PY)Mecabで形態素解析
4. (JS)任せる（処理軽量化）
5. (JS)改行処理
6. (PY)difff, CSVにフォーマット
*/
class Mecab_Manager{
	// this._processMode = "";
	// this._result
	static async sendMessage(mode, params){
		const fd = new FormData();
		fd.append('mode', mode);
		fd.append('params', params);
		return fetch(`/back`, {
			method: 'POST',
			'Content-Type': 'application/x-www-form-urlencoded',
			body: fd
		}).then(
			r => r.text()
		).then(r =>{
			if (r === 'null'){
				throw new Error('server: ArgumentError');
			}else{
				return r;
			}
		});
	}
	static async getPageContents(siteName, url){
		if (url.length > 0){
			try{
				this.setProcessingMode('js');
				const result = await this.sendMessage(siteName, url);
				const html = new DOMParser().parseFromString(result, "text/html");
				switch (siteName){
					case 'wiki':  return this.scrapeWikipedia(html, result);
					case 'nico':  return this.scrapeNiconico(html, result);
					case 'pixiv': return this.scrapePixivDict(html, result);
				}
			}catch (e){
				console.log(e);
				this.setProcessingMode('failed');
				return 1;
			}
		}else{
			this.setProcessingMode('failed');
			return 0;
		}
	}

	static scrapeWikipedia(html){
		let title = html.getElementById('firstHeading');
		title = title ? title.innerText : 'no_title';

		let children = html.querySelector('#mw-content-text');
		children = children.querySelectorAll(
`#mw-content-text > div > h2,         #mw-content-text > div > p,
#mw-content-text > div > ul > li,     #mw-content-text > div > ol > li,
#mw-content-text > div > blockquote`
		);//, dt, dd');
		const removeClasses = ['gallery'];
		children = Array.from(children).filter(el => {
			while (el){
				if (removeClasses.some(klass => el.classList.contains(klass))){
					return false;
				}else{
					el = el.parentElement;
				}
			}
			return true;
		});
		return this.scrapeByChildren(title, children);
	}

	static scrapeNiconico(html){
		let title = html.querySelector('.sw-Article_Title-label');
		title = title ? title.innerText : 'no_title';
		title = title.replace(/単語$/, "");

		let children = html.getElementsByClassName('article')[0];
		children = children.querySelectorAll('h2, p, li, blockquote');
		// page-menu
		return this.scrapeByChildren(title, children);
	}

	static scrapePixivDict(html){
		let title = html.getElementById('article-name');
		title = title ? title.innerText : 'no_title';

		let children = html.getElementById('article-body');
		children = children.querySelectorAll(
			'#article-body > h2, #article-body > p, #article-body > blockquote,' +
			'#article-body > ul > li, #article-body > ol > li'
		);
		const removeClasses = ['article_index'];
		children = Array.from(children).filter(el => {
			while (el){
				if (removeClasses.some(klass => el.classList.contains(klass))){
					return false;
				}else{
					el = el.parentElement;
				}
			}
			return true;
		});
		return this.scrapeByChildren(title, children);
	}

	static scrapeByChildren(
		title, children, removeClasses, stopElements
	){
		if (children.length === 0){
			return 1;
		}
		const noneedParagraph = [
			'脚注', '出典', '関連',
			'参考文献', '外部リンク', '栄典',
			'連載作品', '他の記事言語', '代表作',
			'お絵カキコ', 'テーマ曲'
		];
		let isNoneedParagraph = false;
		let text = '';
		const nr0 = Mecab_Manager.NOT_REPLACE0;
		const nr1 = Mecab_Manager.NOT_REPLACE1;
		for (let i = 0; i < children.length; i++){
			const child = this.removeHtmlTag(children[i]);
			if (child.innerText.length <= 1){ continue; }
			// styleが混ざる不具合に対応
			let str = child.innerText;
			switch (child.tagName.toLowerCase()){
				case 'h2':{
					isNoneedParagraph = noneedParagraph.some(
						name => str.includes(name)
					);
					break;
				}
				case 'p':{
					if (isNoneedParagraph){ continue; }
					if (str.endsWith('。')){ str = str.slice(0, -1); }
					text += str + "。";
					break;
				}
				case 'dt':{
					if (isNoneedParagraph){ continue; }
					if (str.endsWith('。')){ str = str.slice(0, -1); }
					text += nr0 + str + "、" + nr1;
					break;
				}
				case 'dd':{
					if (isNoneedParagraph){ continue; }
					if (str.endsWith('。')){ str = str.slice(0, -1); }
					text += nr0 + str + "。" + nr1;
					break;
				}
				case 'li':{
					if (isNoneedParagraph){ continue; }
					if (str.endsWith('。')){ str = str.slice(0, -1); }
					text += nr0 + "・" + str + "。" + nr1;
					break;
				}
			}
		}
		return [title, text];
	}

	static removeHtmlTag(element){
		const children = element.children;
		for (let i = 0; i < children.length; i++){
			const child = children[i];
			const tagName = child.tagName.toLowerCase();
			if (tagName === 'script' || tagName === 'style'){
				element.removeChild(child);
				i--;
			}else{
				this.removeHtmlTag(child);
			}
		}
		return element;
	}

	static find_all_brackets(text){
		const brackets = [
			["[", "(", "（", "<", '{'],
			["]", ")", "）", ">", '}']
		];
		const found_brackets = [];
		let found_bracket = [];
		let indent = 0;
		for (let i = 0; i < text.length; i++){
			if (brackets[0].includes(text[i])){ // 括弧ひらく
				if (indent++ === 0){
					found_bracket = [i];
				}
			}else if (brackets[1].includes(text[i])){ // 括弧とじ
				if (indent > 0 && --indent === 0){
					found_bracket.push(i + 1);
					found_brackets.push(found_bracket);
				}
			}
		}
		return found_brackets;
	}
	static clip_out_brackets(text){
		const ranges = this.find_all_brackets(text);
		for (let i = ranges.length - 1; i >= 0; i--){
			const range = ranges[i]
			text = text.slice(0, range[0]) + text.slice(range[1])
		}
		return text;
	}

	static textPlainFormat(text){
		// 「」内の語尾変化を行わない
		text = text.replace(/[ 　\n]*([「『【])[ 　\n]*/g, Mecab_Manager.NOT_REPLACE0 + '$1');
		text = text.replace(/[ 　\n]*([」』】])[ 　\n]*/g, '$1' + Mecab_Manager.NOT_REPLACE1);
		// 不要なスペース、改行を除去
		text = text.replace(/[ 　]*[\n\r]+[ 　]*/gm, '');
		text = text.replace(/^\s+|\s*。\s*/gm, '。');
		// mecabに消されないように半角スペースを全角に
		text = text.replace(/\s+/gm, '　');
		text = this.clip_out_brackets(text);
		// brタグを改行コードに置換
		// text = text.replace(/<br(\s*\/)?>/, "<span>\n</span>");
		return text;
	}

	static async startProcessing(
		title, all_text, speaker, newLineNum, newLineSize
	){
		try{
			this.setProcessingMode('py');
			let mecab = await this.processParseByMecab(
				this.textPlainFormat(all_text)
			);

			this.setProcessingMode('js');
			let [old_text, new_text] = this.processChangeSpeaking(
				mecab, speaker
			);
			const new_texts = this.processNewLine(new_text, newLineNum, newLineSize);
			const old_texts = this.processNewLine(old_text, newLineNum, newLineSize);

			// Mecab対策のスペースを外す
			this._result = {
				title: title,
				old_text: old_texts,
				new_text: new_texts,
				speaker: speaker
			};
			await this.processShowDifference();
			this.setProcessingMode('succeed');
		}catch(e){
			console.log(e);
			this.setProcessingMode('failed');
		}
	}

	static processNewLine(all_text, newLineNum, newLineSize){
		let texts = [];
		let text = "";
		let charLength = 0;

		for (let i = 0; i < all_text.length; i++){
			const char = all_text[i];

			const post = i + 1 < all_text.length ? all_text[i + 1] : "";
			if (char === '。'){
				if (Mecab_Manager.BAN_FRONT_LINES.test(post)){
					texts.push(text + char + post);
					i++;
				}else{
					texts.push(text + char);
				}
				text = '';
				charLength = 0;
				continue;
			}else if (charLength < newLineNum){
				text += char;
				charLength += char.length;
				continue;
			}
			const pre = i > 0 ? all_text[i - 1] : "";
			if (
				!Mecab_Manager.BAN_NEW_LINES.test(char) &&
				Mecab_Manager.BAN_BACK_LINES.test(pre)
			){
				text += char + '\n';
				charLength = 0;
			}else if (
				!Mecab_Manager.BAN_NEW_LINES.test(post) &&
				!Mecab_Manager.BAN_FRONT_LINES.test(post) &&
				!Mecab_Manager.BAN_BACK_LINES.test(char)
			){
				text += char + '\n';
				charLength = 0;
			}else{
				text += char;
				charLength += char.length;
			}
		}
		if (text.length > 0){ texts.push(text); }
		const re_big_space = /　+/g;
		return texts.map(str => str.replace(re_big_space, ' '));
	}

	static endProcessing(){
		this._processMode = '';
	}

	static setProcessingMode(mode){
		let text = '';
		switch (mode){
			case 'py':{ text = 'サーバーの応答を待っています……'; break; }
			case 'js':{ text = '文章を処理しています……'; break; }
			case 'succeed':{
				text = '台本が出来上がりました！';
				mode = '';
				break;
			}
			case 'failed':{
				switch (this._processMode){
					case 'py':{ text = 'サーバー側の処理に失敗しました'; break; }
					case 'js':{ text = 'ユーザー側の処理に失敗しました'; break; }
				}
				mode = '';
				break;
			}
		}
		this._processMode = mode;
		UI_Manager.setResultLog(text);
	}

	// 処理中のプロセスがあればボタンを無効にする
	static isProcessing(){
		return this._processMode && this._processMode.length > 0;
	}

	static async processShowDifference(){
		const old_texts = this._result.old_text;
		const new_texts = this._result.new_text;
		const re_new = /\n/g;
		const str_new = "@@@";
		let diff = await this.sendMessage('diff',
			JSON.stringify([old_texts, new_texts].map(
				str1 => str1.map(str2 => str2.replace(re_new, str_new))
			))
		);
		diff = diff.replace(new RegExp(str_new, 'g'), '<br>')
		UI_Manager.finishMecabManager(this._result, diff);
	}

	static async processParseByMecab(text){
		const response = await this.sendMessage('mecab', text);
		const result = response.split('\n').map(
			str => str.split('\t')
		).slice(0, -2); // remove EOS

		// 『。』区切り
		const splitters = [];
		let splitter = [];
		result.forEach(function(noun_list){
			if (noun_list[0] === '。'){
				if (splitter.length <= 1){ return; }
				splitters.push(splitter);
				splitter = [];
			}else{
				splitter.push(noun_list);
			}
		});
		if (splitter.length > Mecab_Manager.NOUN_TYPE){
			splitters.push(splitter);
		}
		return splitters;
	}

	// TODO-Chara_Managerで外部化する
	static processChangeSpeaking(mecab, speaker){
		let randomize_count = 0;
		const speaker_info = Mecab_Manager.GOBI_LIST[speaker];
		function shift_random_count(term_list, match){
			const result = term_list[randomize_count];
			randomize_count = (randomize_count + 1) % 3;
			if (match !== undefined){
				return result.replace(/\$(\d+)/, function(_, i){
					return match[Number(i)] || "";
				});
			}else{
				return result;
			}
		}
		function parse_compile_hash(hash){
			return Object.keys(hash).map(key => [new RegExp(key), hash[key]]);
		}

		const re_bunchus = parse_compile_hash(speaker_info['品詞置換']);
		const re_tan_hash = parse_compile_hash(speaker_info['単純置換']);
		const re_kei_hash = parse_compile_hash(speaker_info['語尾追加']["助動詞"]);
		const last_excepts = speaker_info['語尾追加']["例外置換語尾"];

		const normal_gobi = Object.keys(speaker_info['語尾追加']).filter(
			key => ['助動詞', '例外置換語尾'].includes(key) === false
		);

		let old_texts = '';
		let all_texts = '';
		mecab.forEach(function(noun_list){
			let new_text = '';
			let match;
			noun_list.forEach(function(noun){
				// 文中
				let text = noun[0];
				old_texts += text;
				re_bunchus.some(function(re_bunchu){
					const [term_type, cands] = re_bunchu[1];
					if (
						noun[Mecab_Manager.NOUN_TYPE].includes(term_type) &&
						(match = text.match(re_bunchu[0]))
					){
						text = shift_random_count(cands, match);
						return true;
					}
					return false;
				});
				new_text += text;
			});

			// 単純置換
			re_tan_hash.forEach(function(re_tan){
				// 同じ単語で無限ループすることを防ぐ
				for (let i = 0; i < 100; i++){
					if (match = new_text.match(re_tan)){
						new_text = new_text.replace(
							re_tan[0], shift_random_count(re_tan[1], match)
						);
					}else{
						break;
					}
				}
			});

			// 語尾チェック
			let next = "";
			let noun = noun_list[noun_list.length - 1];
			const last_key = Object.keys(last_excepts).find(
				exc => new_text.endsWith(exc)
			);
			if (last_key){
				new_text = new_text.slice(0, -last_key.length);
				next = shift_random_count(last_excepts[last_key]);
			}else if (noun[Mecab_Manager.NOUN_TYPE].includes("助動詞")){
				// 語尾カウント
				re_kei_hash.some(function(re_kei){
					if (match = noun[0].match(re_kei[0])){
						new_text = new_text.slice(0, -noun[0].length);
						next = shift_random_count(re_kei[1], match);
						return true;
					}
					return false;
				});
			}else{
				const found = normal_gobi.find(
					name => noun[Mecab_Manager.NOUN_TYPE].includes(name)
				);
				if (found){
					next = shift_random_count(speaker_info['語尾追加'][found]);
				}
			}
			old_texts += "。";
			all_texts += new_text + next + "。";
		}, this);
		// 引用部を戻す
		let old_parsed = "";
		let new_parsed = "";

		const new_quotes = this.getAtmarkQuotes(all_texts);
		const old_quotes = this.getAtmarkQuotes(old_texts);
		old_quotes.forEach(function(quote, i){
			if (Array.isArray(quote)){
				let q = quote[0];
				old_parsed += q;
				new_parsed += q;
			}else{
				old_parsed += quote;
				new_parsed += new_quotes[i];
			}
		});
		return [old_parsed, new_parsed];
	}

	static getAtmarkQuotes = function(text){
		const quotes = [];
		let cur_str = "";
		let nr_nest = 0;
		const nr0 = Mecab_Manager.NOT_REPLACE0;
		const nr1 = Mecab_Manager.NOT_REPLACE1;

		for (let i = 0; i < text.length; i++){
			const char = text[i];
			if (char === nr0[0] && text.slice(i, i + nr0.length) === nr0){
				i += nr0.length - 1;
				if (nr_nest++ === 0){
					quotes.push(cur_str);
					cur_str = "";
				}
			}else if (char === nr1[0] && text.slice(i, i + nr1.length) === nr1){
				if (--nr_nest === 0){
					quotes.push([cur_str]);
					cur_str = "";
				}
				i += nr1.length - 1;
			}else{
				cur_str += char;
			}
		}
		if (cur_str.length > 0){ quotes.push(cur_str); }
		return quotes;
	}

	static async exportCsv(){
		if (!this._result){
			this.setProcessingMode('failed');
			return null;
		}else{
			this.setProcessingMode('js');
		}

		const speaker = this._result.speaker;
		const result = await this.sendMessage('csv',
			JSON.stringify(this._result.new_text.map( line => [speaker, line] ))
		);
		if (result === null){
			this.setProcessingMode('failed');
			return null;
		}else{
			this.setProcessingMode('succeed');
		}
		const blob = URL.createObjectURL(new Blob([result], {type: "text/plain"}));
		const title = '[' + this.GOBI_LIST[speaker]["ファイル名"] + ']' +
			this._result.title.replace(/[\\\/\:\*\?\"\<\>\|]/g, "") + '.csv';
		return [title, blob];
	}
}


//=========================================================================================
// - 改行禁止文字
//=========================================================================================
Mecab_Manager.NOUN_TYPE = 4;

Mecab_Manager.NOT_REPLACE0 = "\1@@";
Mecab_Manager.NOT_REPLACE1 = "\2@@";

Mecab_Manager.BAN_NEW_LINES = /^[\u00C0-\u017FA-Za-z]$/i;

Mecab_Manager.BAN_FRONT_LINES =
/^[\+\-\/\!\?\,\.\"\'ァィゥェォッャュョンぁぃぅぇぉっゃゅょん　」』\)）｝】＞≫！？、ー―…ゝ々：；]$/;

Mecab_Manager.BAN_BACK_LINES =
/^[「『\(（｛【＜≪［]$/;

//=========================================================================================
// - 語尾リスト（一つずつずらしながら置き換えられる）
//=========================================================================================
Mecab_Manager.GOBI_LIST = {
    "ゆっくり魔理沙": { // ゆっくりムービーメーカーで対応するキャラ名を指定
      "ファイル名": "mrs", // Google Driveに出力する際の識別子、文字数不問
	  "ロゴカラー": ["#222", "#fc6"],
	  "画像ソース": "", //自動生成
      "品詞置換":{ // 形態素の正規表現: ["品詞の一部", [置換先文字列x3]]
        "^あり$":            ["非自立可能", ["あって", "あり", "あるから"]],
        "^おり$":            ["非自立可能", ["いて", "おり", "いて"]],
        "^しばしば$":             ["副詞", ["よく", "しばしば", "よく"]],
        "^すなわち|即ち$":        ["接続詞", ["つまり", "ということは", "つまり"]],
        "^など|等$":              ["助詞-副助詞", ["とか", "とか", "など"]],
      },
      "単純置換":{ // 形態素無視、単純に置き換えます。
        "により":       ["によって", "により", "のせいで"],
        "または":       ["それか", "それと", "または"],
        "現在においては": ["今では", "今では", "今では"],
		"(\d{3,4})-(\d{3,4})": ["$1から$2", "$1から$2", "$1から$2"]
      },
      "語尾追加":{ // 一行の末尾につける語尾を指定
        "例外置換語尾":{ // この言葉で終わる文章は語尾追加を行わず置換する（形態素無視、正規表現無効）
          "である": ["だ", "だぜ", "なんだぜ"],
          "であった": ["だった", "だったんだ", "だったんだぜ"],
          "です": ["だ", "だぜ", "なんだぜ"],
          "だ": ["だ", "だぜ", "なんだぜ"],
        },
        "助動詞":{ // 置換する
          "^た$":                  ["たんだ", "た", "たぜ"],
          "^だ$":                  ["だ", "だぜ", "だぜ"],
          "^だろう$":              ["だろうな", "だと思うのぜ", "だろうぜ"],
          "^(ら)?れる$":           ["$1れるんだ", "$1れるぜ", "$1れるんだぜ"],
          "^ない$":                ["ないんだ", "ないぜ", "ないんだぜ"],
        },
        // 以下の品詞で終わった際語尾に追加する
        "固有名詞":     ["だ", "らしい", "だそうだ"],
		"名詞-普通名詞-サ変可能": ["する", "するんだ", "するんだぜ"],
        "副助詞":       ["だ", "だ", "なんだぜ"],
        "名詞":         ["だ", "だ", "なんだぜ"],
        "助詞":         ["だ", "だ", "なんだぜ"],
        "形容詞":       ["んだ", "", "んだぜ"],
        "動詞":         ["んだ", "ぜ", "んだぜ"]
      },
    },
    "ゆっくり霊夢": {
      "ファイル名": "rim",
	  "ロゴカラー": ["#f44", "#a5f"],
	  "画像ソース": "", //自動生成
      "品詞置換":{
          "^しかし|、しかし$":   ["接続詞", ["しかし", "だけど", "でも"]],
          "^すなわち|即ち$":      ["接続詞", ["つまり", "すなわち", "つまり"]],
		  "^あり$":            ["非自立可能", ["あって", "あり", "あるから"]],
		  "^おり$":            ["非自立可能", ["いて", "おり", "いて"]],
          "^しばしば$":           ["副詞", ["よく", "しばしば", "よく"]],
          "^かつて$":             ["副詞", ["昔", "かつて", "昔"]],
          "^など|等$":            ["助詞-副助詞", ["とか", "とか", "など"]],
          "^が$":                 ["助詞-接続助詞", ["けど", "けれども", "けど"]],
      },
      "単純置換":{ // 形態素無視
        "よれば":       ["よると", "よると", "よると"],
        "により":       ["によって", "により", "のせいで"],
        "または":       ["それか", "それと", "または"],
        "そのほか":       ["ほかにも", "そのほか", "ほかにも"],
        "現在においては": ["今では", "今では", "今では"],
		"(\d{3,4})-(\d{3,4})": ["$1から$2", "$1から$2", "$1から$2"]
      },
      "語尾追加":{
        "例外置換語尾":{ // この言葉で終わる文章は語尾追加を行わず置換する（形態素無視、正規表現無効）
          "である": ["なの", "ってことね", "なのよ"],
          "であった": ["だった", "だったの", "だったのよ"],
          "です": ["ね", "だよ", "なの"],
          "だ": ["ね", "だよ", "なの"],
        },
        "助動詞":{ // 置換する
          "^た$":                  ["たの", "た", "た"],
          "^だろう$":              ["でしょう", "だろうね", "でしょうね"],
          "^(ら)?れる$":           ["$1れるわ", "$1れるの", "$1れるのよ"],
          "^ない$":                ["ないわ", "ない", "ないの"],
        },
        "固有名詞":     ["よ", "", "だそうよ"],
		"名詞-普通名詞-サ変可能": ["する", "するの", "するのよ"],
        "副助詞":       ["よ", "なの", "なのよ"],
        "名詞":         ["よ", "なの", "なのよ"],
        "助詞":         ["よ", "なの", "なのよ"],
        "形容詞":       ["わ", "ね", "の"],
        "動詞":         ["の", "わ", "んだって"]
      },
    },
    "ずんだもん": {
      "ファイル名": "znd",
	  "ロゴカラー": ["#8e6", "#8a0"],
	  "画像ソース": "", //自動生成
      "品詞置換":{
        "^しかし|、しかし$":     ["接続詞", ["でも", "だけど", "しかし"]],
        "^すなわち|即ち$":        ["接続詞", ["つまり", "つまり", "つまり"]],
        "^より$":                 ["動詞-一般", ["よって", "よって", "より"]],
		"^あり$":            ["非自立可能", ["あって", "あって", "あって"]],
		"^おり$":            ["非自立可能", ["いて", "おり", "いて"]],
        "^しばしば$":             ["副詞", ["よく", "よく", "よく"]],
        "^かつて$":               ["副詞", ["昔", "かつて", "昔"]],
        "^など|等$":              ["助詞-副助詞", ["とか", "とか", "とか"]],
        "^が$":                   ["助詞-接続助詞", ["けど", "けど", "けど"]],
      },
      "単純置換":{ // 形態素無視
        "よれば":       ["よると", "よると", "よると"],
        "または":       ["それか", "それと", "または"],
        "そのほか":       ["ほかにも", "ほかにも", "ほかにも"],
        "現在においては": ["今では", "今では", "今では"],
		"(\d{3,4})-(\d{3,4})": ["$1から$2", "$1から$2", "$1から$2"]
      },
      "語尾追加":{
        "例外置換語尾":{ // この言葉で終わる文章は語尾追加を行わず置換する（形態素無視、正規表現無効）
          "である": ["なのだ", "なのだ", "なのだ"],
          "であった": ["だったのだ", "だったのだ", "であったのだ"],
          "です": ["なのだ", "なのだ", "なのだ"],
          "だ": ["なのだ", "なのだ", "なのだ"],
        },
        "助動詞":{ // 置換する
          "^た$":                  ["たのだ", "たのだ", "たのだ"],
          "^だろう$":              ["だろうけどね", "だと思うのだ", "だろうね"],
          "^(ら)?れる$":                ["$1れるのだ", "$1れるのだ", "$1れるのだ"],
          "^ない$":                ["ないのだ", "ないのだ", "ないのだ"],
        },
        "固有名詞":     ["なのだ", "なのだ", "なのだ"],
		"名詞-普通名詞-サ変可能": ["する", "する", "するのだ"],
        "副助詞":       ["なのだ", "なのだ", "なのだ"],
        "名詞":         ["なのだ", "なのだ", "なのだ"],
        "助詞":         ["なのだ", "なのだ", "なのだ"],
        "形容詞":       ["のだ", "のだ", "のだ"],
        "動詞":         ["のだ", "のだ", "のだ"]
      },
    },
};