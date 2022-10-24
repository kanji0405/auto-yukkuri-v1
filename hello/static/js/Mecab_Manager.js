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
	static async sendMessage(mode, params){
		/*
		const fd = new FormData();
		fd.append('mode', mode);
		fd.append('params', params);
		const file = new File(
			[params],
			"param.txt", {type:"text/plain;charset=utf-8"}
		);
		fd.append("params", file);
		*/
		return fetch(`/mecab?mode=${mode}&params=${params}`
		/*
		, {
			method: 'POST',
			'Content-Type': 'application/x-www-form-urlencoded',
			body: fd
		}*/
		).then(
			r => r.text()
		).then(r =>{
			if (r === 'null'){
				throw new Error('fetching error');
			}else{
				return r;
			}
		});
	}
	static async getPageContents(url){
		const result = await this.sendMessage('url', url);
		return this.htmlToSentence(result);
	}
	static htmlToSentence(result){
		const html = new DOMParser().parseFromString(result, "text/html");
		let title = html.getElementById('firstHeading');
		title = title ? title.innerText : 'no_title';

		let children = html.getElementById(
			'mw-content-text'
		).querySelectorAll('h2, p, ul, ol');
		const stopId = ['脚注', '出典', '関連文献', '関連項目'];
		let needsStop = false;
		let text = '';
		for (let i = 0; needsStop === false && i < children.length; i++){
			const child = children[i];
			switch (child.tagName.toLowerCase()){
				case 'h2':{
					if (stopId.some(id => child.querySelector('#' + id))){
						needsStop = true;
					}
					break;
				}
				case 'p':{
					text += child.innerText;
					break;
				}
				case 'ul':
				case 'ol':{
					text += Array.from(child.children).filter(
						li => li.tagName.toLowerCase() === 'li'
					).map(
						li => '・' + li.innerText + '。'
					).join('\n');
					break;
				}
			}
		}
		return [title, this.clip_out_brackets(text)];
	}
	static find_all_brackets(text){
		const brackets = [
			["[", "(", "（", "<"],
			["]", ")", "）", ">"]
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
		return text
	}

	static async startProcessing(title, all_text, speaker, newLineNum){
		try{
			all_text = all_text.replace(' ', '　');
			let mecab = await this.processParseByMecab(all_text);
			let new_texts = this.processChangeSpeaking(mecab, speaker).join('');
			mecab = await this.processParseByMecab(new_texts);
			new_texts = this.processNewLine(mecab, newLineNum);
			this._result = {
				title: title,
				old_text: all_text.split('。').map(str => str + '。'),
				new_text: new_texts,
				speaker: speaker,
				newLineNum: newLineNum
			};
			UI_Manager.setResultLog('台本が出来上がりました！');
			await this.processShowDifference(
				this._result.old_text,
				this._result.new_text
			);
		}catch(e){
			UI_Manager.setResultLog('何かがうまくいかなかったようです……');
			console.log(e);
		}
	}

	static async processShowDifference(old_text, new_text){
		const diff = await this.sendMessage('diff',
			JSON.stringify([old_text, new_text])
		);
		UI_Manager.finishMecabManager(this._result, diff);
	}

	static async processParseByMecab(text){
		const result = await this.sendMessage('mecab', text);
		console.log(result)
		// 『。』区切り
		const splitters = [];
		let splitter = [];
		JSON.parse(result).map(str => str.split('\t')).forEach(function(noun_list){
			if (noun_list[0] === '。'){
				splitters.push(splitter);
				splitter = [];
			}else{
				splitter.push(noun_list);
			}
		});
		if (splitter.length > 0){ splitters.push(splitter); }
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

		const all_texts = [];
		mecab.forEach(function(noun_list){
			let new_text = '';
			noun_list.forEach(function(noun){
				// 文中
				let text = noun[0];
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
				const found = ["固有名詞", "名詞", "形容詞", "動詞"].find(
					name => noun[Mecab_Manager.NOUN_TYPE].includes(name)
				);
				if (found){
					next = shift_random_count(speaker_info['語尾追加'][found]);
				}
			}
			all_texts.push((new_text + next) + "。");
		}, this);
		return all_texts;
	}

	static processNewLine(mecab, newLineNum){
		let last_index = 0;
		return mecab.map(function(noun_list){
			return noun_list.reduce(function(r, noun, i){
				let cur_length = r.length - last_index;
				if (
					cur_length >= newLineNum &&
					Mecab_Manager.BAN_NEW_LINES.includes(noun[0]) === false &&
					i + 1 < mecab.length
				){
					last_index += cur_length + 1;
					r += '\n';
				}
				return r += noun[0];
			}, '').replace('　', ' ') + '。';
		});
	}

	static async exportCsv(){}
}


//=========================================================================================
// - 改行禁止文字
//=========================================================================================
Mecab_Manager.NOUN_TYPE = 4;

Mecab_Manager.BAN_NEW_LINES = [
    "「", "」", "、", "。",
    "！", "？", "　", "・",
    "ぁ", "ぃ", "ぅ", "ぇ", "ぉ",
    "っ", "ゃ", "ゅ", "ょ",
    "ァ", "ィ", "ゥ", "ェ", "ォ",
    "ッ", "ャ", "ュ", "ョ"
];

//=========================================================================================
// - 語尾リスト（一つずつずらしながら置き換えられる）
//=========================================================================================
Mecab_Manager.GOBI_LIST = {
    "ゆっくり魔理沙": { // ゆっくりムービーメーカーで対応するキャラ名を指定
      "ファイル名": "mrs", // Google Driveに出力する際の識別子、文字数不問
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
        "名詞":         ["だ", "だ", "なんだぜ"],
        "形容詞":       ["んだ", "", "んだぜ"],
        "動詞":         ["んだ", "ぜ", "んだぜ"]
      },
    },
    "ゆっくり霊夢": {
      "ファイル名": "rim",
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
        "名詞":         ["よ", "なの", "なのよ"],
        "形容詞":       ["わ", "ね", "の"],
        "動詞":         ["の", "わ", "んだって"]
      },
    },
    "ずんだもん": {
      "ファイル名": "znd",
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
        "名詞":         ["なのだ", "なのだ", "なのだ"],
        "形容詞":       ["のだ", "のだ", "のだ"],
        "動詞":         ["のだ", "のだ", "のだ"]
      },
    },
};