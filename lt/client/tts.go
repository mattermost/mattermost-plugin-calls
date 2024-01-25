package client

import (
	"fmt"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/service/polly"
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

		return nil, 0, fmt.Errorf("failed to create decoder: %w, resp code: %v, resp status: %v", err, resp.StatusCode, resp.Status)
	}

	return dec, dec.SampleRate(), nil
}

func (u *User) pollyToSpeech(text string) (io.Reader, int, error) {
	input := &polly.SynthesizeSpeechInput{
		Engine:       aws.String("neural"),
		LanguageCode: aws.String(polly.LanguageCodeEnUs),
		OutputFormat: aws.String("mp3"),
		SampleRate:   aws.String("24000"),
		VoiceId:      u.pollyVoiceId,
		Text:         aws.String(text),
	}
	output, err := u.pollySession.SynthesizeSpeech(input)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to synthesize speech with polly, err: %v", err)
	}

	dec, err := mp3.NewDecoder(output.AudioStream)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create decoder: %w, resp code: %v, resp status: %v", err)
	}

	return dec, dec.SampleRate(), nil
}
