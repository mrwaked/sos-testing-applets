Sub Main()
  msgPort = CreateObject("roMessagePort")
  r = CreateObject("roRectangle", 0, 0, 1920, 1080)

  config = {
    url: "file:///sd:/index.html"
  }

  h = CreateObject("roHtmlWidget", r, config)
  h.SetPort(msgPort)
  h.Show()

  while true
    msg = wait(0, msgPort)
    print "type(msg)=";type(msg)
  end while
End Sub
