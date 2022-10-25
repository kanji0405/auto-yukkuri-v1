import traceback
from django.shortcuts import render
from django.http import HttpResponse

import requests
import MeCab
import json
import difflib

import csv
from io import StringIO

# Create your views here.
def index(request):
    return render(request, "index.html")

def back(request):
    res = None
    try:
        mode = request.POST.get('mode')
        params = request.POST.get('params')
        if mode == 'url':
            res = requests.get(params).text
            return HttpResponse(res)
        elif mode == 'mecab':
            tagger = MeCab.Tagger()
            res = [item for item in tagger.parse(params).split('\n')][0:-2]
            return HttpResponse(json.dumps(res, ensure_ascii=False))
        elif mode == 'diff':
            old_text, new_text = json.loads(params, strict=False)
            res = difflib.HtmlDiff().make_table(
                old_text, new_text, context=True
            )
            return HttpResponse(res)
        elif mode == 'csv':
            io = StringIO()
            data = json.loads(params, strict=False)
            csv.writer(io).writerows(data)
            res = io.getvalue()
            io.close()
            return HttpResponse(res)
        else:
            print('mode not found')
    except:
        print(traceback.print_exc())
    return HttpResponse('null')