class UI_Manager{
	static init(){
		this.getSubmitButtons().forEach(function(el, i){
			el.onclick = this.onClickSubmit.bind(this, i);
		}, this);
		this.getTabs().forEach(function(el, index){
			el.onclick = this.onClickTab.bind(this, index);
		}, this);
		this._mode = 0;
		this.refreshMode();
	}
	static getCurrentMode(){
		const wikiForm = document.getElementById('form_wiki');
		return wikiForm && wikiForm.classList.contains('selected') ? 0 : 1;
	}
	static getTabs(){ return document.querySelectorAll('.tab'); }
	static getForms(){ return document.querySelectorAll('.form'); }
	static getSubmitButtons(){ return document.querySelectorAll('button[type=submit]'); }
	static getSpeakerName(){ return document.getElementById('speakerInfo'); }
	static getNewLineNum(){ return document.getElementById('newLineNum'); }
	static refreshMode(){
		this.getTabs().forEach((el, i) => this.setClassByIndex(el, i, this._mode));
		this.getForms().forEach((el, i) => this.setClassByIndex(el, i, this._mode));
	}
	static setClassByIndex(el, i, index){
		el.classList[i === index ? 'add' : 'remove']('selected');
	}
	static changeRangeNum(el){
		el.nextElementSibling.value = el.value;
	}
	static onClickTab(index){
		if (this._mode !== index){
			this._mode = index;
			this.refreshMode()
		}
	}
	static async onClickSubmit(index){
		const forms = this.getForms();
		const speaker = this.getSpeakerName().value;
		const newLineNum = this.getNewLineNum().value;
		let title = '';
		let allText = '';
		switch (index){
			case 0:{
				allText = forms[index].getElementsByTagName('input')[0].value;
				[title, allText] = await Mecab_Manager.getPageContents(allText);
				break;
			}
			case 1:{
				title = "自由作文";
				allText = forms[index].getElementsByTagName('textarea')[0].textContent;
				break;
			}
		}
		Mecab_Manager.startProcessing(title, allText, speaker, newLineNum);
	}
	static finishMecabManager(result, diff){
		const result_title = document.getElementById('result_title');
		result_title.innerText = result.title;
		const element = document.getElementById('result_diff');
		element.innerHTML = diff;
	}
	static setResultLog(text){
		const element = document.getElementById('result_text');
		if (element){ element.innerText = text; }
	}
};
(function(){
	const _window_onload = window.onload;
	window.onload = function(){
		if (_window_onload){
			_window_onload.apply(this, arguments);
		}
		UI_Manager.init();
	}
})();