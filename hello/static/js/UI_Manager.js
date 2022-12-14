window.addEventListener('load', function(){
	UI_Manager.init();
});

class UI_Manager{
	static init(){
		// 解説者
		const speaker = this.getSpeakerName();
		if (speaker){
			Object.keys(Mecab_Manager.GOBI_LIST).forEach(function(key, i){
				const option = document.createElement('option');
				option.value = key;
				option.innerText = key;
				speaker.append(option);
			});
			this.onChangeSpeakerInfo(speaker);
		}
		// タブの更新
		this._tabIndex = 0; // 現在のタブ番号
		this.refreshTab();
	}
	/* index.html */
	static getTabs(){ return document.querySelectorAll('.tab'); }
	static getForms(){ return document.querySelectorAll('.form'); }
	static getSpeakerName(){ return document.getElementById('speakerInfo'); }
	static getNewLineNum(){ return document.getElementById('newLineNum'); }
	static getNewLineSize(){ return document.getElementById('newLineSize'); }
	static getSiteRadioButtons(){ return document.querySelectorAll('.radio_box input'); }
	static refreshTab(){
		this.getTabs().forEach((el, i) => this.setClassByIndex(el, i));
		this.getForms().forEach((el, i) => this.setClassByIndex(el, i));
	}
	static setClassByIndex(el, i){
		el.classList[i === this._tabIndex ? 'add' : 'remove']('selected');
	}

	static setResultLog(text){
		const element = document.getElementById('result_text');
		if (element){ element.innerText = text; }
	}

	/* events */
	static onClickTab(index){
		if (this._tabIndex !== index){
			this._tabIndex = index;
			this.refreshTab()
		}
	}
	static onUrlPressed(e){
		if (e.keyCode === 13){
			e.preventDefault();
			this.onClickSubmit(0);
		}
	}
	static onChangeRangeNum(el){
		el.nextElementSibling.value = el.value;
	}
	static onChangeSpeakerInfo(el){
		const div = document.querySelector('div.chara');
		const colors = Mecab_Manager.GOBI_LIST[el.value]['ロゴカラー'];
		if (div && colors){
			div.style.background = `linear-gradient(${colors[0]
				} 0%,${colors[0]} 48%, ${colors[1]} 52%, ${colors[1]
			} 100%)`;
		}
	}
	static async onExportCsv(){
		if (Mecab_Manager.isProcessing()){ return; }
		const result = await Mecab_Manager.exportCsv();
		if (result !== null){
			const atag = document.createElement('a');
			[atag.download, atag.href] = result;
			atag.click();
		}
	}
	static getSelectedSiteName(){
		const radio_box = this.getSiteRadioButtons();
		let siteName = 'wiki';
		for (let i = 0; i < radio_box.length; i++){
			if (radio_box[i].checked){
				siteName = radio_box[i].value;
				break;
			}
		}
		return siteName;
	}
	static async onClickSubmit(index){
		if (Mecab_Manager.isProcessing()){ return; }
		const forms = this.getForms();
		const speaker = this.getSpeakerName().value;
		const newLineNum = Math.floor(this.getNewLineNum().value);
		const newLineSize = Math.floor(this.getNewLineSize().value);
		const siteName = this.getSelectedSiteName();
		let title = '';
		let allText = '';
		switch (index){
			case 0:{
				allText = forms[index].getElementsByTagName('input')[0].value;
				const result = await Mecab_Manager.getPageContents(siteName, allText);
				switch (result){
					case 0:{
						Mecab_Manager.endProcessing();
						return this.setResultLog('URLの指定が無効です。');
					}
					case 1:{
						Mecab_Manager.endProcessing();
						return this.setResultLog('ページを取得できませんでした。');
					}
					default: { [title, allText] = result; break; }
				}
				break;
			}
			case 1:{
				title = "自由作文";
				allText = forms[index].getElementsByTagName('textarea')[0].value;
				break;
			}
		}
		Mecab_Manager.startProcessing(
			title, allText, speaker, newLineNum, newLineSize
		);
	}
	static finishMecabManager(result, diff){
		const result_area = document.getElementById("result_area");
		if (result_area){ result_area.style.display = 'unset'; }

		const result_title = document.getElementById('result_title');
		if (result_title){ result_title.innerText = result.title; }

		const element = document.getElementById('result_diff');
		if (element){
			element.innerHTML = diff;
			const td = element.querySelectorAll('td[nowrap=nowrap]');
			if (td){
				Array.from(td).forEach(function(t){
					t.removeAttribute('nowrap');
					t.style.whiteSpace = 'normal';
					t.style.width = "48%";
				});
			}
		}
		Mecab_Manager.endProcessing();
	}
};