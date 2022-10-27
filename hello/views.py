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

def howto(request):
    return render(request, "howto.html")

def back(request):
    try:
        mode = request.POST.get('mode')
        params = request.POST.get('params')
        # get URL
        if   mode == 'wiki':
            return _export_html("https://ja.wikipedia.org/wiki/", params)
        elif mode == 'nico':
            return _export_html("https://dic.nicovideo.jp/t/a/", params)
        elif mode == 'pixiv':
            return _export_html("https://dic.pixiv.net/a/", params)
        # other
        elif mode == 'mecab':
            return _export_mecab(params)
        elif mode == 'diff':
            return _export_diff(params)
        elif mode == 'csv':
            return _export_csv(params)
        else:
            print('mode not found')
    except:
        print(traceback.print_exc())
    return HttpResponse('null')

# back processings
def _export_html(header, params):
    res = requests.get(header + params).text
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) > > AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1",
    }
    return HttpResponse(res, headers=headers)

def _export_mecab(params):
    tagger = MeCab.Tagger()
    return HttpResponse(tagger.parse(params))

def _export_diff(params):
    old_text, new_text = json.loads(params, strict=False)
    res = difflib.HtmlDiff().make_table(old_text, new_text, context=True)
    return HttpResponse(res)

def _export_csv(params):
    io = StringIO()
    data = json.loads(params, strict=False)
    csv.writer(io).writerows(data)
    res = io.getvalue()
    io.close()
    return HttpResponse(res)