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
def _export_html(root, params):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36",
        "Access-Control-Allow-Origin": None,
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
    }
    res = requests.get(
        root + params,
        headers=headers,
        timeout=(10.0, 15.0)
    ).text
    return HttpResponse(res)

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