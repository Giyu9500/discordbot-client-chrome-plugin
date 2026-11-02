// Native Messaging host for Windows. The browser owns the lifecycle of the
// local REST bridge: a host starts when an extension tab connects and exits
// when that tab disconnects. Nothing is installed as a Windows service.
package main

import (
    "encoding/binary"
    "encoding/json"
    "errors"
    "fmt"
    "io"
    "net/http"
    "os"
    "os/exec"
    "path/filepath"
    "strings"
    "syscall"
    "time"
)

func send(v any) error {
    data, err := json.Marshal(v)
    if err != nil { return err }
    if len(data) > 1024*1024 { return errors.New("message too large") }
    length := make([]byte,4)
    binary.LittleEndian.PutUint32(length,uint32(len(data)))
    if _, err := os.Stdout.Write(length); err != nil { return err }
    _, err = os.Stdout.Write(data)
    return err
}

func main() {
    defer func(){if v:=recover(); v!=nil {fmt.Fprintln(os.Stderr, "native panic",v)}}()
    exe, err := os.Executable()
    if err != nil { send(map[string]string{"type":"error","message":"Nie znaleziono folderu programu."});return }
    base := filepath.Dir(exe)
    script := filepath.Join(base,"server.js")
    node, err := exec.LookPath("node.exe")
    if err != nil { node,err=exec.LookPath("node") }
    if err != nil { send(map[string]string{"type":"error","message":"Node.js nie jest w PATH. Zainstaluj Node.js i uruchom ponownie przeglądarkę."});return }
    child := exec.Command(node,script)
    child.Stdin = nil
    child.SysProcAttr = &syscall.SysProcAttr{HideWindow:true, CreationFlags:0x08000000}
    // Native protocol owns stdout! Child output must never contaminate it.
    child.Stdout = os.Stderr
    child.Stderr = os.Stderr
    child.Dir = base
    child.Env = os.Environ()
    if err := child.Start(); err != nil { send(map[string]string{"type":"error","message":"Nie udało się uruchomić Node.js: "+err.Error()});return }
    defer func(){_ = child.Process.Kill();_ = child.Wait()}()

    client := http.Client{Timeout:500*time.Millisecond}
    ready:=false
    for i:=0;i<40;i++ {
       r,e:=client.Get("http://127.0.0.1:17643/health")
       if e==nil {
          var body struct {Service string `json:"service"`; Version string `json:"version"`}
          _=json.NewDecoder(r.Body).Decode(&body)
          _=r.Body.Close()
          if r.StatusCode==200 && body.Service=="DiscordBotPanelLocalBridge" && strings.HasPrefix(body.Version,"1.12.") {ready=true;break}
       }
       time.Sleep(150*time.Millisecond)
    }
    if !ready { send(map[string]string{"type":"error","message":"Pomocnik nie wystartował. Zamknij stare START-PANEL.bat i spróbuj ponownie."});return }
    if err:=send(map[string]string{"type":"ready","version":"1.12.0"});err!=nil{return}
    // Keep connection open. When the panel tab closes, Chrome closes stdin.
    for {
       var size uint32
       if err:=binary.Read(os.Stdin,binary.LittleEndian,&size);err!=nil {if err!=io.EOF{fmt.Fprintln(os.Stderr,err)};return}
       if size>65536 {return}
       buf:=make([]byte,size)
       if _,err:=io.ReadFull(os.Stdin,buf);err!=nil {return}
       var data map[string]any
       if json.Unmarshal(buf,&data)!=nil {continue}
       if data["type"]=="ping" {if send(map[string]string{"type":"pong"})!=nil{return}}
    }
}
