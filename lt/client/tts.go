package client

import (
	"fmt"
	mp3 "github.com/hajimehoshi/go-mp3"
	"io"
	"net/http"
	"net/url"
)

func textToSpeech(text string) (io.Reader, int, error) {
	resp, err := http.Get(fmt.Sprintf("http://translate.google.com/translate_tts?ie=UTF-8&total=1&idx=0&textlen=32&client=tw-ob&q=%s&tl=%s",
		url.QueryEscape(text), "en"))
	if err != nil {
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}

	dec, err := mp3.NewDecoder(resp.Body)
	if err != nil {
		resp.Body.Close()
		return nil, 0, fmt.Errorf("failed to create decoder: %w", err)
	}

	return dec, dec.SampleRate(), nil
}
