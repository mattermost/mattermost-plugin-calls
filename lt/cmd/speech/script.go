package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go/service/polly"
)

type Script struct {
	users     []string
	voiceIDs  []string
	nameToIdx map[string]int
	blocks    []Block
}

type Block struct {
	delay    time.Duration
	speakers []int
	text     []string
}

func importScript(r io.Reader) (Script, error) {
	lineNum := 0
	scanner := bufio.NewScanner(r)

	// voices -- max of 5 female, 4 male
	femaleIDs := []string{polly.VoiceIdDanielle, polly.VoiceIdJoanna, polly.VoiceIdKendra, polly.VoiceIdSalli, polly.VoiceIdRuth}
	maleIDs := []string{polly.VoiceIdGregory, polly.VoiceIdJoey, polly.VoiceIdMatthew, polly.VoiceIdStephen}
	rand.Shuffle(len(femaleIDs), func(i, j int) { femaleIDs[i], femaleIDs[j] = femaleIDs[j], femaleIDs[i] })
	rand.Shuffle(len(maleIDs), func(i, j int) { maleIDs[i], maleIDs[j] = maleIDs[j], maleIDs[i] })

	// get the participants
	if !scanner.Scan() {
		return Script{}, errors.New("no data in file")
	}
	lineNum++

	script := Script{
		users:     nil,
		nameToIdx: make(map[string]int),
		blocks:    nil,
	}

	script.users = strings.Fields(scanner.Text())
	script.voiceIDs = make([]string, len(script.users))
	for i, u := range script.users {
		nameMf := strings.Split(u, "-")
		name, mf := nameMf[0], nameMf[1]
		script.nameToIdx[name] = i
		script.users[i] = name

		if mf == "F" {
			if len(femaleIDs) == 0 {
				return Script{}, fmt.Errorf("ran out of female voiceIDs -- edit the importScript to create more, or change the code to fill it back up at this point")
			}
			script.voiceIDs[i], femaleIDs = femaleIDs[0], femaleIDs[1:]
		} else {
			if len(maleIDs) == 0 {
				return Script{}, fmt.Errorf("ran out of male voiceIDs -- edit the importScript to create more, or change the code to fill it back up at this point")
			}
			script.voiceIDs[i], maleIDs = maleIDs[0], maleIDs[1:]
		}
	}

	if !scanner.Scan() || len(scanner.Text()) != 0 {
		return Script{}, errors.New("second line should be blank")
	}
	lineNum++

	curBlock := Block{}
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()

		// First line will be the delay
		var err error
		if curBlock.delay, err = time.ParseDuration(line); err != nil {
			return Script{}, fmt.Errorf("failed to parse duration: %s, lineNum: %d, err: %v", line, lineNum, err)
		}

		// Loop over the speaker + text line pairs
		for scanner.Scan() {
			lineNum++
			line = scanner.Text()

			// blank line means we're done
			if len(line) == 0 {
				script.blocks = append(script.blocks, curBlock)
				curBlock = Block{}
				break
			}

			speakerIdx, ok := script.nameToIdx[line]
			if !ok {
				return Script{}, fmt.Errorf("failed to find speaker: %s, lineNum: %d", line, lineNum)
			}

			lineNum++
			if !scanner.Scan() {
				return Script{}, fmt.Errorf("failed to read expected text, lineNum: %d", lineNum)
			}
			speakerText := scanner.Text()

			curBlock.speakers = append(curBlock.speakers, speakerIdx)
			curBlock.text = append(curBlock.text, speakerText)
		}
		if len(curBlock.text) != 0 {
			// add final block in case we didn't end on a blank line
			script.blocks = append(script.blocks, curBlock)
		}
	}

	return script, nil
}
