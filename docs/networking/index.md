# Networking

## OSI model:

OSI model is a conceptual framework to understand how the network communication between two machine.
These machine can be brower and server or server and server. But the model stays the same. 

So GET request starts from the browser towards 111.168.0.1:80 includes headers, cookies, this is application layer(layer 7).

Then comes the presentation layer that encrypts if the encryption is enabled like with https protocol.

Then comes the session layer, this is where session tags are added, this is how it is modeled in the OSI model but it is encrypted too. 
Now session tag means these can be things like cookie or jwt tokens. That is used by statelesss server to identify request.

But for the first time when request is sent there will not be any cookie, the cookie will be return by server and then browser will send it back with every request.

After session layer comes the transport layer this is where connection is opened. And encrypted payload is broken down into segments.
Each segment contains the source and destination port.

Next comes the session network layer, that adds the destination and source IP and groups segements into packets.
Then comes the data link layer, that adds the mac addressess for next hop. and current one which is router that your machine is using. And this layer adds the frames.

Then comes the physical layer this is where everything gets turned into binary signals and sent over the wires and other mediums. Now current has no direction
that means your frames get sent all over the world to the machine that even aren't intended recepient. But they refuse the message, this is the job of 
network card. 

You source and destination ip remains same. But there maybe lots of hops(intermediary nodes between u and destination) those remove the frame. 
Use routing table to get information of next machine's mac address. Source takes the address of the current hop here and destination take the mac address o the next hop/final destination whichever is closer.

So finally when frames reach the final destination, now frames are converted to packets, then segments and decrepted and this is how it reaches the destination. 

Now when server wants to send a response, it sends that using the source IP that tells where the request came from and the same process is repeated again through the hops if there are any. LAN of course won't have any hops.

When request leaves from browser u may have private IP but router adds the public ip of router to the frame so this is how server would know where to send back response. 

Media Access Control(MAC): Is a unique address that identifies your machine in LAN.
Public IP: is what that uniquely identifies you machine/router globally.

Have a look at the images below.

![](./../images/a-network.png)

![](./../images/image1.png)

![](./../images//image2.png)



<!--

    ## TCP:

    ## UDP:

    ## Trade offs:

-->
