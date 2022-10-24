from django.shortcuts import render
from django.http import HttpResponse

import requests
import MeCab
import json
import difflib

# Create your views here.
def index(request):
    return render(request, "index.html")

def mecab(request):
    res = None
    try:
        mode = request.GET.get('mode')
        params = request.GET.get('params')
        if mode == 'url':
            res = requests.get(params).text
            return HttpResponse(res)
        elif mode == 'mecab':
            tagger = MeCab.Tagger()
            res = [item for item in tagger.parse(params).split('\n')][0:-2]
            return HttpResponse(json.dumps(res, ensure_ascii=False))
        elif mode == 'diff':
            old_text, new_text = json.loads(params)
            res = difflib.HtmlDiff().make_table(
                old_text, new_text, context=True
            )
            return HttpResponse(res)
        elif mode == 'csv':
            pass # TODO
    except:
        pass
    return HttpResponse('null')