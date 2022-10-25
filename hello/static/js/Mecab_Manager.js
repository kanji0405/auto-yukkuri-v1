/*
Wikipedia
1. (PY)URL先取得
2. (JS)DOMから文章抽出、括弧を消す
自由作文
1. (JS)そのまま渡す

共通処理
2. (PY)Mecabで形態素解析
3. (JS)任せる
（処理軽量化）
4. (PY)JSの結果を受け取り再び形態素解析
5. (JS)改行処理
6. (PY)CSVにフォーマット
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
	static async getPageContents(url){
		if (url.match(/^(http(?:s)?\:\/\/)ja\.wikipedia\.org\/wiki\//)){
			const result = await this.sendMessage('url', url);
			return this.scrapeWikipedia(result);
		}else{
			this.setProcessingMode('failed');
			return 0;
		}
	}
	static scrapeWikipedia(result){
		this.setProcessingMode('js');
		const html = new DOMParser().parseFromString(result, "text/html");
		let title = html.getElementById('firstHeading');
		title = title ? title.innerText : 'no_title';

		let children = html.querySelector('#mw-content-text');
		if (children){
			children = children.querySelectorAll(
				'#mw-content-text > div > h2, #mw-content-text > div > p, ' +
				'#mw-content-text > div > ul > li, #mw-content-text > div > ol > li, ' +
				'#mw-content-text > div > blockquote'
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
			if (children.length === 0){
				this.setProcessingMode('failed');
				return 1;
			}
		}else{
			return 1;
		}
		const stopId = [
			'脚注', '出典', '関連文献', '関連項目',
			'参考文献', '外部リンク', '関連作品', '栄典'
		];
		let needsStop = false;
		let text = '';
		const nr = Mecab_Manager.NOT_REPLACE;
		for (let i = 0; needsStop === false && i < children.length; i++){
			const child = children[i];
			if (child.innerText.length <= 1){ continue; }
			let str = child.innerText;
			switch (child.tagName.toLowerCase()){
				case 'h2':{
					if (stopId.some(id => child.querySelector('#' + id))){
						needsStop = true;
					}
					break;
				}
				case 'p':{
					text += str;
					break;
				}
				case 'dt':{
					if (str.endsWith('。')){ str = str.slice(0, str.length - 1); }
					text += nr + str + "、" + nr;
					break;
				}
				case 'dd':{
					if (str.endsWith('。')){ str = str.slice(0, str.length - 1); }
					text += nr + str + "。" + nr;
					break;
				}
				case 'li':{
					if (str.endsWith('。')){ str = str.slice(0, str.length - 1); }
					text += nr + "・" + str + "。" + nr;
					break;
				}
			}
		}
		// styleが混ざる不具合に対応
		text = text.replace(/@media\screen/g, '');
		return [title, text];
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
		const nr = Mecab_Manager.NOT_REPLACE;
		text = text.replace(/([「『【])/g, nr + '$1');
		text = text.replace(/([」』】])/g, '$1' + nr);
		// 不要なスペース、改行を除去
		text = text.replace(/[\n\r]+/gm, '');
		text = text.replace(/^\s+|\s*。\s*/gm, '。');
		// mecabに消されないように半角スペースを全角に
		text = text.replace(/\s+/gm, '　');
		text = this.clip_out_brackets(text);
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

			this.setProcessingMode('py');
			mecab = await this.processParseByMecab(new_text);

			this.setProcessingMode('js');
			const re_big_space = /　+/g;
			old_text = old_text.replace(re_big_space, ' ');
			new_text = new_text.replace(re_big_space, ' ');
			const new_texts = this.processNewLine(
				mecab, newLineNum, newLineSize
			).map(str => str.replace(re_big_space, ' '));

			const old_texts = old_text.replace(
				re_big_space, ' '
			).split("。").map(str => str + '。');

			// Mecab対策のスペースを外す
			this._result = {
				title: title,
				old_text: old_texts,
				new_text: new_texts,
				speaker: speaker,
				newLineNum: newLineNum,
				newLineSize: newLineSize
			};
			await this.processShowDifference();
			this.setProcessingMode('succeed');
		}catch(e){
			console.log(e);
			this.setProcessingMode('failed');
		}
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
		const str_diff = '@!@';
		const re_in = /\n/g;
		const str_in = '@@@';
		let diff = await this.sendMessage('diff',
			JSON.stringify([old_texts, new_texts].map(
				str => [str.join(str_diff).replace(re_in, str_in)]
			))
		);
		diff = diff.replace(new RegExp(str_in, 'g'), '<br>');
		diff = diff.replace(new RegExp(str_diff, 'g'), '<hr>');
		UI_Manager.finishMecabManager(this._result, diff);
	}

	static async processParseByMecab(text){
		const result = await this.sendMessage('mecab', text);
		// 『。』区切り
		const splitters = [];
		let splitter = [];
		JSON.parse(result).map(str => str.split('\t')).forEach(function(noun_list){
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
	static processChangeSpeaking(mecab, speaker){
		let randomize_count = 0;
		const speaker_info = Mecab_Manager.GOBI_LIST[speaker];
		function shift_random_count(term_list){
			const result = term_list[randomize_count];
			randomize_count = (randomize_count + 1) % 3;
			return result;
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
			noun_list.forEach(function(noun){
				// 文中
				let text = noun[0];
				old_texts += text;
				re_bunchus.some(function(re_bunchu){
					const [term_type, cands] = re_bunchu[1];
					if (
						noun[Mecab_Manager.NOUN_TYPE].includes(term_type) &&
						text.match(re_bunchu[0])
					){
						text = shift_random_count(cands);
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
					if (new_text.match(re_tan)){
						new_text = new_text.replace(
							re_tan[0], shift_random_count(re_tan[1])
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
				new_text = new_text.slice(0, new_text.length - last_key.length);
				next = shift_random_count(last_excepts[last_key]);
			}else if (noun[Mecab_Manager.NOUN_TYPE].includes("助動詞")){
				// 語尾カウント
				re_kei_hash.some(function(re_kei){
					if (noun[0].match(re_kei[0])){
						new_text = new_text.slice(0, new_text.length - noun[0].length);
						next = shift_random_count(re_kei[1]);
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
		old_quotes.forEach(function(text, i){
			old_parsed += text;
			new_parsed += i % 2 === 0 ? new_quotes[i] : text;
		}, "");

		return [old_parsed, new_parsed];
	}

	static getAtmarkQuotes = function(text){
		return text.split(Mecab_Manager.NOT_REPLACE);
	}

	static processNewLine(mecab, newLineNum, newLineSize){
		const array = [];
		mecab.forEach(function(noun_list){
			let last_index = 0;
			// 形態素による区切り
			const texts = noun_list.reduce(function(r, noun, i){
				const text = noun[0];
				let cur_length = r.length - last_index;
				if (cur_length >= newLineNum && 0 < i){
					let needNewLine = false;
					const cur_hinshi = noun_list[i - 1][Mecab_Manager.NOUN_TYPE];
					const next_hinshi = noun[Mecab_Manager.NOUN_TYPE];
					if (Mecab_Manager.BAN_NEW_LINES.test(text)){
						needNewLine = false;
					}else if (
						cur_hinshi.includes('助動詞') ||
						cur_hinshi.includes('動詞')
					){
						if (!next_hinshi.includes('助動詞')){
							needNewLine = true;
						}
					}else if (cur_hinshi.includes('接続詞')){
						if (!next_hinshi.includes('接続詞')){
							needNewLine = true;
						}
					}else{
						needNewLine = true;
					}
					if (needNewLine){
						last_index += cur_length + 1;
						r += '\n';
					}
				}else{
					if (
						text.length > 3 && text.length + cur_length >= newLineNum &&
						noun[Mecab_Manager.NOUN_TYPE].includes('名詞')
					){
						let j;
						for (j = 2; j < text.length; j++){
							if (
								j + cur_length >= newLineNum &&
								!Mecab_Manager.BAN_NEW_LINES.test(text[j])
							){
								break;
							}
						}
						last_index += cur_length + 1 + j;
						return r += text.slice(0, j) + '\n' + text.slice(j, text.length);
					}
				}
				return r += text;
			}, '') + "。";
			const wLine = texts.split('\n');
			const tmpLines = [];
			for (let i = 0; i < wLine.length;){
				tmpLines.push(wLine.slice(i, i += newLineSize).join('\n'));
			}
			if (tmpLines.length >= 2){
				// N行以上ある時、最終行が2行以上行でなく
				// 文字数が少なければ結合する
				const prelastIndex = tmpLines.length - 2;
				const lastLine = tmpLines[tmpLines.length - 1];
				if (
					lastLine.includes('\n') === false &&
					(tmpLines[prelastIndex] + lastLine).length <=
					newLineNum * (newLineSize + 1) - 6
				){
					tmpLines[prelastIndex] += tmpLines.pop();
				}
			}
			array.push(...tmpLines);
		});
		return array;
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

Mecab_Manager.NOT_REPLACE = "@@@";

Mecab_Manager.BAN_NEW_LINES =
/^[\w\+\-\!\?\,\.\"\'ァィゥェォッャュョンぁぃぅぇぉっゃゅょん　」！？、。・―…]/;

//=========================================================================================
// - 語尾リスト（一つずつずらしながら置き換えられる）
//=========================================================================================
Mecab_Manager.GOBI_LIST = {
    "ゆっくり魔理沙": { // ゆっくりムービーメーカーで対応するキャラ名を指定
      "ファイル名": "mrs", // Google Driveに出力する際の識別子、文字数不問
	  "画像ソース": "", //自動生成
      "品詞置換":{ // 形態素の正規表現: ["品詞の一部", [置換先文字列x3]]
        "^あり|おり$":            ["非自立可能", ["あって", "あり", "あるから"]],
        "^しばしば$":             ["副詞", ["よく", "しばしば", "よく"]],
        "^すなわち|即ち$":        ["接続詞", ["つまり", "ということは", "つまり"]],
        "^など|等$":              ["助詞-副助詞", ["とか", "とか", "など"]],
      },
      "単純置換":{ // 形態素無視、正規表現無効。単純に置き換えます。
        "により":       ["によって", "が原因で", "のせいで"],
        "または":       ["それか", "それと", "または"],
        "現在においては": ["今では", "今では", "今では"],
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
          "^れる$":                ["れるんだ", "れるぜ", "れるんだぜ"],
          "^られる$":                ["られるんだ", "られるぜ", "られるんだぜ"],
          "^ない$":                ["ないんだ", "ないぜ", "ないんだぜ"],
        },
        // 以下の品詞で終わった際語尾に追加する
        "固有名詞":     ["だ", "らしい", "だそうだ"],
		"名詞-普通名詞-サ変可能": ["する", "するんだ", "するんだぜ"],
        "名詞":         ["だ", "だ", "なんだぜ"],
        "形容詞":       ["んだ", "", "んだぜ"],
        "動詞":         ["んだ", "ぜ", "んだぜ"]
      },
    },
    "ゆっくり霊夢": {
      "ファイル名": "rim",
	  "画像ソース": "", //自動生成
      "品詞置換":{
          "^しかし|、しかし$":   ["接続詞", ["しかし", "だけど", "でも"]],
          "^すなわち|即ち$":      ["接続詞", ["つまり", "すなわち", "つまり"]],
          "^あり|おり$":          ["非自立可能", ["あって", "あり", "あるから"]],
          "^しばしば$":           ["副詞", ["よく", "しばしば", "よく"]],
          "^かつて$":             ["副詞", ["昔", "かつて", "昔"]],
          "^など|等$":            ["助詞-副助詞", ["とか", "とか", "など"]],
          "^が$":                 ["助詞-接続助詞", ["けど", "けれども", "けど"]],
      },
      "単純置換":{ // 形態素無視、正規表現無効
        "よれば":       ["よると", "よると", "よると"],
        "により":       ["によって", "が原因で", "のせいで"],
        "または":       ["それか", "それと", "または"],
        "そのほか":       ["ほかにも", "そのほか", "ほかにも"],
        "現在においては": ["今では", "今では", "今では"],
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
          "^れる$":                ["れるわ", "れるの", "れるのよ"],
          "^られる$":              ["られるわ", "られるの", "られるのよ"],
          "^ない$":                ["ないわ", "ない", "ないの"],
        },
        "固有名詞":     ["よ", "", "だそうよ"],
		"名詞-普通名詞-サ変可能": ["する", "するの", "するのよ"],
        "名詞":         ["よ", "なの", "なのよ"],
        "形容詞":       ["わ", "ね", "の"],
        "動詞":         ["の", "わ", "んだって"]
      },
    },
    "ずんだもん": {
      "ファイル名": "znd",
	  "画像ソース": "", //自動生成
      "品詞置換":{
        "^しかし|、しかし$":     ["接続詞", ["でも", "だけど", "しかし"]],
        "^すなわち|即ち$":        ["接続詞", ["つまり", "つまり", "つまり"]],
        "^より$":                 ["動詞-一般", ["よって", "よって", "より"]],
        "^あり|おり$":            ["非自立可能", ["あって", "あって", "あって"]],
        "^しばしば$":             ["副詞", ["よく", "よく", "よく"]],
        "^かつて$":               ["副詞", ["昔", "かつて", "昔"]],
        "^など|等$":              ["助詞-副助詞", ["とか", "とか", "とか"]],
        "^が$":                   ["助詞-接続助詞", ["けど", "けど", "けど"]],
      },
      "単純置換":{ // 形態素無視、正規表現無効
        "よれば":       ["よると", "よると", "よると"],
        "または":       ["それか", "それと", "または"],
        "そのほか":       ["ほかにも", "ほかにも", "ほかにも"],
        "現在においては": ["今では", "今では", "今では"],
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
          "^れる$":                ["れるのだ", "れるのだ", "れるのだ"],
          "^られる$":              ["られるのだ", "られるのだ", "られるのだ"],
          "^ない$":                ["ないのだ", "ないのだ", "ないのだ"],
        },
        "固有名詞":     ["なのだ", "なのだ", "なのだ"],
		"名詞-普通名詞-サ変可能": ["する", "する", "するのだ"],
        "名詞":         ["なのだ", "なのだ", "なのだ"],
        "形容詞":       ["のだ", "のだ", "のだ"],
        "動詞":         ["のだ", "のだ", "のだ"]
      },
    },
};